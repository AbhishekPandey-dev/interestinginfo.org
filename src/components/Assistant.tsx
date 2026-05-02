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
const VOICE_STORAGE_KEY = 'assistant-preferred-voice';

const PREFERRED_VOICE_NAMES = [
  'Microsoft David Online (Natural)',
  'Microsoft Mark Online (Natural)',
];

const SELECTION_TOOLTIP_VOICE_NAMES = [
  'Microsoft Mark Online (Natural)',
  'Microsoft Mark Desktop',
  'Microsoft Mark',
];

const MALE_VOICE_HINTS = [
  'andrew',
  'brian',
  'guy',
  'davis',
  'david',
  'christopher',
  'eric',
  'roger',
  'mark',
  'george',
  'daniel',
  'james',
  'ryan',
  'alex',
  'fred',
  'tom',
];

const FEMALE_VOICE_HINTS = [
  'aria',
  'ava',
  'emma',
  'jenny',
  'michelle',
  'sara',
  'susan',
  'zira',
  'samantha',
  'victoria',
  'karen',
  'moira',
  'serena',
  'sonia',
  'tessa',
  'olivia',
  'female',
];

const FRIENDLY_MALE_VOICE_NAMES = [
  'Mark',
  'David',
  'Trey',
];

const FRIENDLY_FEMALE_VOICE_NAMES = [
  'Ava',
  'Emma',
  'Sophia',
  'Olivia',
  'Mia',
  'Sara',
];

const VISIBLE_VOICE_LABELS = new Set(['Mark', 'David', 'Sophia', 'Mia']);

export const NATURAL_SPEECH_PROFILE = {
  rate: 0.92,
  pitch: 0.84,
  volume: 1,
};

export function selectBestVoice(
  voices: SpeechSynthesisVoice[],
  preferredVoiceId?: string | null,
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;

  const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('en'));
  const candidates = englishVoices.length > 0 ? englishVoices : voices;
  const preferredVoice = preferredVoiceId
    ? candidates.find((voice) => voiceId(voice) === preferredVoiceId)
    : undefined;

  if (preferredVoice) return preferredVoice;

  return [...candidates].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

export function selectSelectionTooltipVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('en'));
  const candidates = englishVoices.length > 0 ? englishVoices : voices;

  for (const preferredName of SELECTION_TOOLTIP_VOICE_NAMES) {
    const voice = candidates.find((candidate) =>
      candidate.name.toLowerCase().includes(preferredName.toLowerCase()),
    );
    if (voice) return voice;
  }

  const markVoice = candidates.find((voice) => voice.name.toLowerCase().includes('mark'));
  return markVoice || selectBestVoice(candidates);
}

export function applyNaturalSpeechProfile(utterance: SpeechSynthesisUtterance, voice?: SpeechSynthesisVoice) {
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || 'en-US';
  utterance.rate = NATURAL_SPEECH_PROFILE.rate;
  utterance.pitch = NATURAL_SPEECH_PROFILE.pitch;
  utterance.volume = NATURAL_SPEECH_PROFILE.volume;
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang?.toLowerCase() || '';
  let score = 0;

  const preferredIndex = PREFERRED_VOICE_NAMES.findIndex((preferred) =>
    name.includes(preferred.toLowerCase()),
  );
  if (preferredIndex >= 0) score += 120 - preferredIndex * 4;

  if (lang === 'en-us') score += 30;
  else if (lang === 'en-gb' || lang === 'en-au') score += 22;
  else if (lang.startsWith('en')) score += 16;

  if (name.includes('natural')) score += 42;
  if (name.includes('neural')) score += 38;
  if (name.includes('online')) score += 18;
  if (name.includes('premium')) score += 14;
  if (name.includes('enhanced')) score += 12;

  if (name.includes('microsoft')) score += 14;
  if (name.includes('google')) score += 8;
  if (name.includes('apple')) score += 7;

  if (MALE_VOICE_HINTS.some((hint) => name.includes(hint))) score += 34;
  if (FEMALE_VOICE_HINTS.some((hint) => name.includes(hint))) score -= 30;
  if (name.includes('female')) score -= 40;
  if (name.includes('male')) score += 20;
  if (voice.localService) score += 4;

  return score;
}

function voiceId(voice: SpeechSynthesisVoice): string {
  return `${voice.voiceURI || voice.name}|${voice.lang}`;
}

function displayVoiceName(voice: SpeechSynthesisVoice, index: number): string {
  const voiceName = voice.name.toLowerCase();
  const gender = inferVoiceGender(voice);

  if (gender === 'male') {
    const exactMaleName = FRIENDLY_MALE_VOICE_NAMES.find((name) => voiceName.includes(name.toLowerCase()));
    return exactMaleName || FRIENDLY_MALE_VOICE_NAMES[index % FRIENDLY_MALE_VOICE_NAMES.length];
  }

  if (gender === 'female') {
    const exactFemaleName = FRIENDLY_FEMALE_VOICE_NAMES.find((name) => voiceName.includes(name.toLowerCase()));
    return exactFemaleName || FRIENDLY_FEMALE_VOICE_NAMES[index % FRIENDLY_FEMALE_VOICE_NAMES.length];
  }

  return `Voice ${index + 1}`;
}

function visibleVoiceOptions(voices: SpeechSynthesisVoice[]) {
  return voices
    .map((voice, index) => {
      const label = displayVoiceName(voice, index);
      return {
        voice,
        label: label === 'Voice 4' ? 'Sophia' : label,
        value: voiceId(voice),
      };
    })
    .filter((option) => VISIBLE_VOICE_LABELS.has(option.label));
}

function inferVoiceGender(voice: SpeechSynthesisVoice): 'male' | 'female' | 'unknown' {
  const voiceName = voice.name.toLowerCase();
  const hasMaleHint = MALE_VOICE_HINTS.some((hint) => voiceName.includes(hint));
  const hasFemaleHint = FEMALE_VOICE_HINTS.some((hint) => voiceName.includes(hint));

  if (hasMaleHint && !hasFemaleHint) return 'male';
  if (hasFemaleHint && !hasMaleHint) return 'female';
  return 'unknown';
}

function sortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices]
    .filter((voice) => voice.lang?.toLowerCase().startsWith('en'))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

function chunkText(text: string, maxWordsPerChunk = 130): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences.length ? sentences : [text]) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.split(/\s+/).length > maxWordsPerChunk && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(VOICE_STORAGE_KEY);
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);
  const voiceOptions = visibleVoiceOptions(voices);
  const selectedVoiceValue = voiceOptions.some((option) => option.value === selectedVoiceId)
    ? selectedVoiceId || ''
    : voiceOptions[0]?.value || '';

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
      const nextVoices = sortVoices(window.speechSynthesis.getVoices());
      setVoices(nextVoices);
      if (nextVoices.length > 0) {
        setVoicesReady(true);
        setSelectedVoiceId((current) => {
          if (current && nextVoices.some((voice) => voiceId(voice) === current)) {
            return current;
          }

          const bestVoice = selectBestVoice(nextVoices);
          return bestVoice ? voiceId(bestVoice) : current;
        });
      }
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

  const handleVoiceChange = (voiceValue: string) => {
    setSelectedVoiceId(voiceValue);
    localStorage.setItem(VOICE_STORAGE_KEY, voiceValue);
  };

  const previewVoice = () => {
    speak('Hello. I will read this document in this voice.');
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

    const availableVoices = window.speechSynthesis.getVoices();
    if (!voicesReady && availableVoices.length === 0) {
      window.setTimeout(() => {
        setVoicesReady(true);
        speak(text);
      }, 300);
      return;
    }

    window.speechSynthesis.cancel();
    cancelledRef.current = false;

    const currentVoices = sortVoices(window.speechSynthesis.getVoices());
    const voice = selectBestVoice(currentVoices, selectedVoiceId);
    const chunks = chunkText(trimmed);
    let index = 0;

    setSpeaking(true);

    const speakChunk = () => {
      if (cancelledRef.current || index >= chunks.length) {
        setSpeaking(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      applyNaturalSpeechProfile(utterance, voice);
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

          {speechSupported && voiceOptions.length > 0 && (
            <div className="assistant-voice-row">
              <label htmlFor="assistant-voice-select">Voice</label>
              <select
                id="assistant-voice-select"
                value={selectedVoiceValue}
                onChange={(event) => handleVoiceChange(event.target.value)}
                aria-label="Assistant voice"
              >
                {voiceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button onClick={previewVoice} type="button">
                Preview
              </button>
            </div>
          )}

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
