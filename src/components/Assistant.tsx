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
  const panelRef = useRef<HTMLDivElement>(null);
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

  // Handle visual viewport for mobile keyboard
  useEffect(() => {
    if (!open) return;
    const updateViewportHeight = () => {
      if (panelRef.current && window.visualViewport) {
        if (window.innerWidth < 640) {
          panelRef.current.style.height = `${window.visualViewport.height}px`;
          panelRef.current.style.top = `${window.visualViewport.offsetTop}px`;
        } else {
          panelRef.current.style.height = '';
          panelRef.current.style.top = '';
        }
      }
    };
    
    updateViewportHeight();
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('scroll', updateViewportHeight);
    
    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
      if (panelRef.current) {
        panelRef.current.style.height = '';
        panelRef.current.style.top = '';
      }
    };
  }, [open]);

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
        className="chat-bubble-button bg-primary text-primary-foreground hover:scale-105 active:scale-95 inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-transform"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="AI assistant"
          className="chat-panel bg-card text-card-foreground border border-border"
        >
          <div className="chat-header">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
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
              className="chat-close-btn hover:bg-accent rounded-md"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="chat-messages">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                Hi! I can help you read this document. Try one of these:
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`${m.role === 'user' ? 'msg-user bg-primary text-primary-foreground' : 'msg-assistant bg-secondary text-secondary-foreground'}`}
                >
                  {m.text}
                </div>
                {m.speakable && (
                  <button
                    onClick={() => speak(m.speakable!)}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-border text-foreground hover:bg-accent transition-colors"
                  >
                    <Volume2 className="h-4 w-4" /> Read summary
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="chat-chips-area">
            <Chip onClick={handleSummarise} icon={<FileText className="h-4 w-4" />}>
              Summarise
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
            className="chat-input-area bg-card"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything…"
              aria-label="Message"
              className="chat-input bg-secondary text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              aria-label="Send"
              className="chat-send-btn bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center"
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
      className={`chat-chip inline-flex items-center gap-1.5 transition-colors border ${
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

