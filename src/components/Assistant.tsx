import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Square, FileText, Volume2, MousePointer2 } from 'lucide-react';
import { extractSummaryBody, htmlToPlainText, summarize } from '@/lib/docUtils';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  speakable?: string; // when set, show a "Read aloud" button under this message
}

interface AssistantProps {
  htmlContent: string;
}

const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

const PREFERRED_VOICE_NAMES = [
  'Microsoft Guy Online (Natural)',
  'Microsoft Brian Online (Natural)',
  'Microsoft Andrew Online (Natural)',
  'Google US English Male',
  'Microsoft David Online (Natural)',
  'Microsoft Mark Online (Natural)',
  'Google US English',
  'Alex',
];

export function selectBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;
  for (const name of PREFERRED_VOICE_NAMES) {
    const v = voices.find(
      (vv) => vv.name === name && vv.lang?.toLowerCase().startsWith('en'),
    );
    if (v) return v;
  }
  return (
    voices.find((v) => v.lang?.startsWith('en-US') && v.name.toLowerCase().includes('male')) ||
    voices.find((v) => v.lang?.startsWith('en-US') && !v.name.toLowerCase().includes('female') && !v.name.toLowerCase().includes('uk')) ||
    voices.find((v) => v.lang?.startsWith('en-US')) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('en'))
  );
}

function chunkText(text: string, wordsPerChunk = 200): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }
  return chunks;
}

export function Assistant({ htmlContent }: AssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  // Wait for voices to load — they arrive async in most browsers
  useEffect(() => {
    if (!speechSupported) return;
    const check = () => {
      if (window.speechSynthesis.getVoices().length > 0) setVoicesReady(true);
    };
    check();
    window.speechSynthesis.onvoiceschanged = () => check();
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const stopSpeaking = () => {
    if (!speechSupported) return;
    cancelledRef.current = true;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const speak = (text: string) => {
    if (!speechSupported) {
      pushAssistant('Sorry, your browser does not support speech.');
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      pushAssistant('Nothing to read.');
      return;
    }

    if (!voicesReady) {
      const interval = setInterval(() => {
        if (window.speechSynthesis.getVoices().length > 0) {
          clearInterval(interval);
          setVoicesReady(true);
          speak(text);
        }
      }, 100);
      return;
    }

    window.speechSynthesis.cancel();
    cancelledRef.current = false;

    const voices = window.speechSynthesis.getVoices();
    const voice = selectBestVoice(voices);
    const chunks = chunkText(trimmed, 200);
    let i = 0;

    setSpeaking(true);

    const speakChunk = () => {
      if (cancelledRef.current || i >= chunks.length) {
        setSpeaking(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || 'en-US';
      u.rate = 0.88;
      u.pitch = 0.92;
      u.volume = 1.0;
      u.onend = () => speakChunk();
      u.onerror = () => speakChunk();
      window.speechSynthesis.speak(u);
    };

    speakChunk();
  };

  const pushUser = (text: string) => setMessages((m) => [...m, { role: 'user', text }]);
  const pushAssistant = (text: string, speakable?: string) =>
    setMessages((m) => [...m, { role: 'assistant', text, speakable }]);

  const handleSummarise = () => {
    pushUser('Summarise document');
    const s = summarize(htmlContent);
    pushAssistant(s, extractSummaryBody(s));
  };

  const handleReadAloud = () => {
    pushUser('Read aloud');
    const text = htmlToPlainText(htmlContent);
    pushAssistant('Reading the document aloud…');
    speak(text);
  };

  const handleReadSelection = () => {
    const sel = window.getSelection()?.toString().trim();
    if (!sel) {
      pushAssistant('Highlight some text on the page first, then ask me to read it.');
      return;
    }
    pushAssistant('Reading the selected text…');
    speak(sel);
  };

  const handleSend = () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    pushUser(q);
    const lower = q.toLowerCase();
    if (lower.includes('summar')) {
      const s = summarize(htmlContent);
      pushAssistant(s, extractSummaryBody(s));
    } else if (
      lower.includes('read this') || 
      lower.includes('read selection') || 
      lower.includes('read selected') || 
      lower.includes('read what i selected')
    ) {
      const sel = window.getSelection()?.toString().trim();
      if (sel) {
        handleReadSelection();
      } else {
        pushAssistant('Please select some text on the page first, then I can read it for you.');
      }
    } else if (lower.includes('stop')) {
      stopSpeaking();
      pushAssistant('Stopped.');
    } else if (lower.includes('read')) {
      const text = htmlToPlainText(htmlContent);
      pushAssistant('Reading the document aloud…');
      speak(text);
    } else {
      pushAssistant(
        'I can summarise this document or read it aloud for you. Try asking me to summarise or select text and ask me to read it.',
      );
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        className="fixed bottom-[80px] right-4 md:bottom-6 md:right-6 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95 inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="AI assistant"
          className="fixed z-40 bg-card text-card-foreground border border-border shadow-2xl flex flex-col
                     bottom-0 right-0 left-0 top-0 md:top-auto md:left-auto md:bottom-[104px] md:right-6
                     md:w-[360px] md:h-[480px] md:rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Assistant</span>
              {speaking && (
                <span
                  aria-label="Speaking"
                  className="ml-1 inline-flex items-end gap-0.5 h-3"
                >
                  <span className="w-0.5 bg-primary animate-pulse-bar-1" />
                  <span className="w-0.5 bg-primary animate-pulse-bar-2" />
                  <span className="w-0.5 bg-primary animate-pulse-bar-3" />
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Hi! I can help you read this document. Try one of these:
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] text-sm rounded-2xl px-3 py-2 whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-secondary text-secondary-foreground rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
                {m.speakable && (
                  <button
                    onClick={() => speak(m.speakable!)}
                    className="mt-1 inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full border border-border text-foreground hover:bg-accent"
                  >
                    <Volume2 className="h-4 w-4" /> Read summary
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="px-3 pt-2 flex flex-wrap gap-2 border-t border-border">
            <Chip onClick={handleSummarise} icon={<FileText className="h-4 w-4" />}>
              Summarise document
            </Chip>
            <Chip onClick={handleReadAloud} icon={<Volume2 className="h-4 w-4" />}>
              Read aloud
            </Chip>
            <Chip onClick={handleReadSelection} icon={<MousePointer2 className="h-4 w-4" />}>
              Read selection
            </Chip>
            {speaking && (
              <Chip onClick={stopSpeaking} icon={<Square className="h-4 w-4" />} danger>
                Stop
              </Chip>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything…"
              aria-label="Message"
              className="flex-1 h-10 px-3 rounded-lg bg-secondary text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              aria-label="Send"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Chip({
  onClick,
  children,
  icon,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-colors ${
        danger
          ? 'border-destructive text-destructive hover:bg-destructive/10'
          : 'border-border text-foreground hover:bg-accent'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
