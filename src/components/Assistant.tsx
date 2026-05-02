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

function WelcomeCard() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '32px 20px',
      gap: '12px',
      flex: 1,
    }}>
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '8px',
      }}>
        <span style={{ fontSize: '24px' }}>✨</span>
      </div>
      
      <p style={{
        fontSize: '17px',
        fontWeight: '600',
        color: '#111111',
        margin: 0,
      }}>
        Hi, I am your reading assistant
      </p>
      
      <p style={{
        fontSize: '14px',
        color: '#666666',
        margin: 0,
        lineHeight: '1.5',
        maxWidth: '240px',
      }}>
        I can summarise this document, read it aloud, 
        or read any text you select on the page.
      </p>
      
      <p style={{
        fontSize: '12px',
        color: '#999999',
        margin: '8px 0 0 0',
      }}>
        Try one of the options below ↓
      </p>
    </div>
  );
}

export function Assistant({ htmlContent }: AssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Handle visual viewport for mobile keyboard and breakpoints
  useEffect(() => {
    if (!open) return;
    const updateViewport = () => {
      if (panelRef.current) {
        const width = window.innerWidth;
        const panel = panelRef.current;
        
        panel.style.top = '';
        panel.style.left = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.width = '';
        panel.style.height = '';
        panel.style.borderRadius = '';

        if (width < 768) {
          panel.style.top = '0';
          panel.style.left = '0';
          panel.style.right = '0';
          panel.style.bottom = '0';
          panel.style.width = '100%';
          panel.style.height = window.visualViewport ? `${window.visualViewport.height}px` : '100dvh';
          if (window.visualViewport) {
            panel.style.top = `${window.visualViewport.offsetTop}px`;
          }
          panel.style.borderRadius = '0';
        } else {
          // Desktop / Tablet (>= 768px)
          panel.style.bottom = '100px';
          panel.style.right = '32px';
          panel.style.width = '380px';
          panel.style.height = '600px';
          panel.style.borderRadius = '16px';
        }
      }
    };
    
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
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
        style={{
          position: 'fixed',
          bottom: windowWidth < 768 ? '80px' : '32px',
          right: windowWidth < 768 ? '20px' : '32px',
          width: windowWidth < 768 ? '56px' : '52px',
          height: windowWidth < 768 ? '56px' : '52px',
          borderRadius: '50%',
          zIndex: 9995,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: 'none',
          background: 'hsl(var(--primary))',
          color: 'hsl(var(--primary-foreground))',
          transition: 'transform 0.15s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1.0)'}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
      >
        {open ? <X size={24} /> : <Sparkles size={24} />}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="AI assistant"
          style={{
            position: 'fixed',
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            overflow: 'hidden',
            zIndex: 9994,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)'
          }}
        >
          <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            height: '56px',
            minHeight: '56px',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            flexShrink: 0,
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontSize: '14px' }}>✨</span>
              </div>
              <span style={{
                fontSize: '15px',
                fontWeight: '600',
                color: '#111111',
              }}>
                Reading Assistant
              </span>
              {speaking && (
                <span
                  aria-label="Speaking"
                  style={{
                    marginLeft: '4px',
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    gap: '2px',
                    height: '12px'
                  }}
                >
                  <span className="animate-pulse-bar-1" style={{ width: '2px', height: '100%', background: 'hsl(var(--primary))' }} />
                  <span className="animate-pulse-bar-2" style={{ width: '2px', height: '100%', background: 'hsl(var(--primary))' }} />
                  <span className="animate-pulse-bar-3" style={{ width: '2px', height: '100%', background: 'hsl(var(--primary))' }} />
                </span>
              )}
            </div>
            
            <button
              onClick={() => setOpen(false)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0,0,0,0.06)',
                color: '#555555',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </header>

          <div ref={scrollRef} style={{ 
            flex: 1, 
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            scrollBehavior: 'smooth'
          }}>
            {messages.length === 0 ? <WelcomeCard /> : (
              messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: m.role === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '10px 14px',
                      borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      fontSize: 'clamp(13px, 2vw, 15px)',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      background: m.role === 'user' ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                      color: m.role === 'user' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--secondary-foreground))'
                    }}
                  >
                    {m.text}
                  </div>
                  {m.speakable && (
                    <button
                      onClick={() => speak(m.speakable!)}
                      style={{
                        marginTop: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        border: '1px solid hsl(var(--border))',
                        color: 'hsl(var(--foreground))',
                        background: 'transparent',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'hsl(var(--accent))'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Volume2 size={16} /> Read summary
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div style={{ 
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '10px 14px',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            flexShrink: 0 
          }}>
            <Chip onClick={handleSummarise} icon={<FileText size={16} />}>
              Summarise
            </Chip>
            <Chip onClick={handleReadAloud} icon={<Volume2 size={16} />}>
              Read aloud
            </Chip>
            <Chip onClick={handleReadSelection} icon={<MousePointer2 size={16} />}>
              Read selection
            </Chip>
            {speaking && (
              <Chip onClick={stopSpeaking} icon={<Square size={16} />} danger>
                Stop
              </Chip>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 14px',
              borderTop: '1px solid rgba(0,0,0,0.08)',
              flexShrink: 0,
              background: '#ffffff',
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything…"
              aria-label="Message"
              style={{
                flex: 1,
                height: '40px',
                borderRadius: '999px',
                border: '1px solid rgba(0,0,0,0.15)',
                padding: '0 16px',
                fontSize: '16px',
                outline: 'none',
                background: '#f9f9f9',
                color: '#111111',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.6)';
                e.currentTarget.style.background = '#ffffff';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
                e.currentTarget.style.background = '#f9f9f9';
              }}
            />
            <button
              type="submit"
              aria-label="Send"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: 'none',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Send size={16} />
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
  const [hover, setHover] = useState(false);
  
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderRadius: '999px',
        fontSize: '13px',
        fontWeight: 500,
        minHeight: '36px',
        cursor: 'pointer',
        border: `1px solid ${hover ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.12)'}`,
        background: danger ? '#fee2e2' : hover ? '#f5f5f5' : '#ffffff',
        color: danger ? '#ef4444' : '#333333',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s ease',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

