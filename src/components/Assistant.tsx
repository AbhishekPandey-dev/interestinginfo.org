import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FileText,
  MousePointer2,
  Send,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { extractSummaryBody, htmlToPlainText, summarize } from '@/lib/docUtils';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  speakable?: string;
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
    const voice = voices.find(
      (candidate) => candidate.name === name && candidate.lang?.toLowerCase().startsWith('en'),
    );
    if (voice) return voice;
  }

  return (
    voices.find((voice) => voice.lang?.startsWith('en-US') && voice.name.toLowerCase().includes('male')) ||
    voices.find(
      (voice) =>
        voice.lang?.startsWith('en-US') &&
        !voice.name.toLowerCase().includes('female') &&
        !voice.name.toLowerCase().includes('uk'),
    ) ||
    voices.find((voice) => voice.lang?.startsWith('en-US')) ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith('en'))
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

function WelcomeCard() {
  return (
    <div className="assistant-welcome">
      <div className="assistant-welcome-icon" aria-hidden="true">
        <Sparkles size={24} />
      </div>
      <h2>Hi, I am your reading assistant</h2>
      <p>I can summarise this document, read it aloud, or read selected text from the page.</p>
    </div>
  );
}

export function Assistant({ htmlContent }: AssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    document.documentElement.classList.add('assistant-open');

    const updateViewport = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--assistant-viewport-height', `${height}px`);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      document.documentElement.style.removeProperty('--assistant-viewport-height');
      document.documentElement.classList.remove('assistant-open');
    };
  }, [open]);

  useEffect(() => {
    if (!speechSupported) return;

    const checkVoices = () => {
      if (window.speechSynthesis.getVoices().length > 0) setVoicesReady(true);
    };

    checkVoices();
    window.speechSynthesis.onvoiceschanged = checkVoices;

    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const pushUser = (text: string) => setMessages((current) => [...current, { role: 'user', text }]);

  const pushAssistant = (text: string, speakable?: string) =>
    setMessages((current) => [...current, { role: 'assistant', text, speakable }]);

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
      const interval = window.setInterval(() => {
        if (window.speechSynthesis.getVoices().length > 0) {
          window.clearInterval(interval);
          setVoicesReady(true);
          speak(text);
        }
      }, 100);
      return;
    }

    window.speechSynthesis.cancel();
    cancelledRef.current = false;

    const voice = selectBestVoice(window.speechSynthesis.getVoices());
    const chunks = chunkText(trimmed, 200);
    let index = 0;

    setSpeaking(true);

    const speakChunk = () => {
      if (cancelledRef.current || index >= chunks.length) {
        setSpeaking(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || 'en-US';
      utterance.rate = 0.88;
      utterance.pitch = 0.92;
      utterance.volume = 1;
      utterance.onend = speakChunk;
      utterance.onerror = speakChunk;
      window.speechSynthesis.speak(utterance);
    };

    speakChunk();
  };

  const summariseDocument = () => {
    const summary = summarize(htmlContent);
    pushAssistant(summary, extractSummaryBody(summary));
  };

  const handleSummarise = () => {
    pushUser('Summarise document');
    summariseDocument();
  };

  const handleReadAloud = () => {
    pushUser('Read aloud');
    pushAssistant('Reading the document aloud...');
    speak(htmlToPlainText(htmlContent));
  };

  const handleReadSelection = () => {
    const selectedText = window.getSelection()?.toString().trim();

    if (!selectedText) {
      pushAssistant('Select some text on the page first, then ask me to read it.');
      return;
    }

    pushUser('Read selected text');
    pushAssistant('Reading the selected text...');
    speak(selectedText);
  };

  const handleClear = () => {
    stopSpeaking();
    setMessages([]);
    setInput('');
  };

  const handleSend = () => {
    const question = input.trim();
    if (!question) return;

    setInput('');
    pushUser(question);

    const lower = question.toLowerCase();
    const selectedText = window.getSelection()?.toString().trim();

    if (lower.includes('stop')) {
      stopSpeaking();
      pushAssistant('Stopped.');
    } else if (lower.includes('clear') || lower.includes('reset')) {
      handleClear();
    } else if (lower.includes('summar')) {
      summariseDocument();
    } else if (
      lower.includes('read selection') ||
      lower.includes('read selected') ||
      lower.includes('read this') ||
      lower.includes('read what i selected')
    ) {
      if (selectedText) {
        pushAssistant('Reading the selected text...');
        speak(selectedText);
      } else {
        pushAssistant('Please select some text on the page first, then I can read it for you.');
      }
    } else if (lower.includes('read')) {
      pushAssistant('Reading the document aloud...');
      speak(htmlToPlainText(htmlContent));
    } else {
      pushAssistant(
        'I can summarise this document, read it aloud, or read selected text. Try "summarise", "read aloud", or select text and ask me to read it.',
      );
    }
  };

  return (
    <>
      {!open && (
        <button
          className="assistant-launcher"
          onClick={() => setOpen(true)}
          aria-label="Open reading assistant"
          type="button"
        >
          <Sparkles size={22} />
        </button>
      )}

      {open && (
        <div className="assistant-shell" role="dialog" aria-modal="false" aria-label="Reading assistant">
          <header className="assistant-header">
            <div className="assistant-title-wrap">
              <span className="assistant-title-icon" aria-hidden="true">
                <Sparkles size={16} />
              </span>
              <div>
                <p className="assistant-title">Reading Assistant</p>
                {speaking && (
                  <span className="assistant-speaking-label">
                    Speaking
                    <span className="assistant-speaking-bars" aria-hidden="true">
                      <span className="animate-pulse-bar-1" />
                      <span className="animate-pulse-bar-2" />
                      <span className="animate-pulse-bar-3" />
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="assistant-header-actions">
              {messages.length > 0 && (
                <button className="assistant-ghost-button" onClick={handleClear} type="button">
                  Clear
                </button>
              )}
              <button
                className="assistant-icon-button"
                onClick={() => setOpen(false)}
                aria-label="Close reading assistant"
                type="button"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="assistant-messages" aria-live="polite">
            {messages.length === 0 ? (
              <WelcomeCard />
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn('assistant-message-row', message.role === 'user' && 'assistant-message-row-user')}
                >
                  <div className={cn('assistant-message', `assistant-message-${message.role}`)}>
                    {message.text}
                  </div>
                  {message.speakable && (
                    <button
                      className="assistant-read-summary"
                      onClick={() => speak(message.speakable!)}
                      type="button"
                    >
                      <Volume2 size={15} />
                      Read summary
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="assistant-actions" aria-label="Assistant actions">
            <ActionChip onClick={handleSummarise} icon={<FileText size={15} />}>
              Summarise
            </ActionChip>
            <ActionChip onClick={handleReadAloud} icon={<Volume2 size={15} />}>
              Read aloud
            </ActionChip>
            <ActionChip onClick={handleReadSelection} icon={<MousePointer2 size={15} />}>
              Selection
            </ActionChip>
            {speaking && (
              <ActionChip onClick={stopSpeaking} icon={<Square size={15} />} danger>
                Stop
              </ActionChip>
            )}
          </div>

          <form
            className="assistant-composer"
            onSubmit={(event) => {
              event.preventDefault();
              handleSend();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask me anything..."
              aria-label="Message"
              autoComplete="off"
            />
            <button type="submit" aria-label="Send message" disabled={!input.trim()}>
              <Send size={17} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function ActionChip({
  onClick,
  children,
  icon,
  danger,
}: {
  onClick: () => void;
  children: ReactNode;
  icon: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('assistant-action-chip', danger && 'assistant-action-chip-danger')}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
