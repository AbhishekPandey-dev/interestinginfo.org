import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, Play, Pause, Square, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ReadingModeToggle } from '@/components/ReadingModeToggle';
import { Assistant, selectBestVoice } from '@/components/Assistant';
import { DocxView } from '@/components/DocxView';
import { ZoomControl } from '@/components/ZoomControl';
import { useLenis } from '@/hooks/useLenis';
import { DocumentSkeleton } from '@/components/DocumentSkeleton';

function SelectionTooltip() {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [speechState, setSpeechState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const speechStateRef = useRef(speechState);
  speechStateRef.current = speechState;

  useEffect(() => {
    const handleMouseUp = () => {
      if (speechStateRef.current !== 'idle') return;

      // Minor delay to let selection settle
      setTimeout(() => {
        const selectedText = window.getSelection()?.toString().trim() || '';
        if (selectedText.length > 3) {
          const range = window.getSelection()?.getRangeAt(0);
          if (range) {
            const rect = range.getBoundingClientRect();
            setTooltip({
              x: rect.left + rect.width / 2,
              y: rect.top + window.scrollY - 48,
              text: selectedText
            });
          }
        } else {
          setTooltip(null);
        }
      }, 10);
    };

    const handleScroll = () => {
      if (speechStateRef.current === 'idle') setTooltip(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && speechStateRef.current === 'idle') setTooltip(null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('scroll', handleScroll);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!tooltip) return null;

  const handleReadAloud = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.speechSynthesis.cancel();
    
    // Attempt to wake up voices if they haven't loaded yet
    const voices = window.speechSynthesis.getVoices();
    const voice = selectBestVoice(voices);
    
    const u = new SpeechSynthesisUtterance(tooltip.text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-US';
    u.rate = 0.88;
    u.pitch = 0.92;
    u.volume = 1.0;
    
    u.onstart = () => setSpeechState('playing');
    u.onpause = () => setSpeechState('paused');
    u.onresume = () => setSpeechState('playing');
    u.onend = () => {
      setSpeechState('idle');
      setTooltip(null);
    };
    u.onerror = () => {
      setSpeechState('idle');
      setTooltip(null);
    };

    window.speechSynthesis.speak(u);
  };

  const handlePausePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (speechState === 'playing') {
      window.speechSynthesis.pause();
      setSpeechState('paused'); // fallback if event is sluggish
    } else if (speechState === 'paused') {
      window.speechSynthesis.resume();
      setSpeechState('playing'); // fallback
    }
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.speechSynthesis.cancel();
    setSpeechState('idle');
    setTooltip(null);
  };

  return createPortal(
    <div
      className="selection-tooltip-container"
      style={{
        position: 'absolute',
        top: tooltip.y,
        left: tooltip.x,
        transform: 'translateX(-50%)',
        background: '#1a1a1a',
        color: 'white',
        borderRadius: '999px',
        padding: '6px 8px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        zIndex: 9999,
        animation: 'fade-in 120ms ease',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}
    >
      {speechState === 'idle' ? (
        <button
          onClick={handleReadAloud}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'transparent',
            color: 'white',
            border: 'none',
            padding: '2px 8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <Volume2 className="h-4 w-4" /> Read aloud
        </button>
      ) : (
        <>
          <button
            onClick={handlePausePlay}
            style={{
              background: 'transparent',
              color: 'white',
              border: 'none',
              padding: '4px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '999px'
            }}
            title={speechState === 'playing' ? "Pause" : "Play"}
          >
            {speechState === 'playing' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={handleStop}
            style={{
              background: 'transparent',
              color: 'white',
              border: 'none',
              padding: '4px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '999px'
            }}
            title="Stop"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

interface DocRow {
  html_content: string;
  is_published: boolean;
  file_name: string;
  file_url: string;
}

function ZoomedDocView({ zoom, fileUrl, onReady }: { zoom: number; fileUrl: string; onReady?: () => void }) {
  const docRef = useRef<HTMLDivElement>(null);
  const [docHeight, setDocHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handler = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setDocHeight(el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fileUrl]);

  const effectiveZoom = viewportWidth < 768 ? Math.max(1.0, zoom) : zoom;
  const logicalWidth = viewportWidth / effectiveZoom;

  return (
    <div
      style={{
        width: '100%',
        height: docHeight * zoom,
        position: 'relative',
        overflow: 'visible',
      }}
    >
      <div
        ref={docRef}
        style={{
          width: logicalWidth,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          position: 'absolute',
          overflow: 'visible',
        }}
      >
        <DocxView fileUrl={fileUrl} onReady={onReady} />
      </div>
    </div>
  );
}

export default function Index() {
  useLenis();
  const [doc, setDoc] = useState<DocRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('doc-zoom');
    return saved ? parseFloat(saved) : 1.0;
  });

  useEffect(() => {
    localStorage.setItem('doc-zoom', zoom.toString());
  }, [zoom]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('published_document')
        .select('html_content, is_published, file_name, file_url')
        .eq('is_published', true)
        .maybeSingle();
      if (!active) return;

      if (data) {
        const lastUrl = localStorage.getItem('last-doc-url');
        const currentUrl = data.file_url;

        if (lastUrl && lastUrl !== currentUrl) {
          // New document was published — clear old cache
          const cache = await caches.open('docx-cache-v1');
          await cache.delete(lastUrl);
          console.log('[Cache] Cleared old document cache');
        }
        localStorage.setItem('last-doc-url', currentUrl);
      }

      setDoc(data ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div 
      style={{ 
        width: '100%',
        minHeight: '100vh',
        overflowX: 'hidden',
        overflowY: 'visible',
        paddingTop: 'clamp(16px, 3vw, 32px)',
        paddingBottom: '80px'
      }}
    >
      <ReadingModeToggle />

      {loading ? (
        <div className="min-h-[100dvh] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !doc ? (
        <div className="min-h-[100dvh] flex items-center justify-center" style={{ padding: '24px' }}>
          <p className="text-muted-foreground" style={{ fontSize: 'clamp(14px, 2vw, 18px)' }}>Nothing here yet.</p>
        </div>
      ) : (
        <>
          {isLoadingDoc && <DocumentSkeleton />}
          <div style={{ display: isLoadingDoc ? 'none' : 'block', width: '100%' }}>
            <ZoomedDocView zoom={zoom} fileUrl={doc.file_url} onReady={() => setIsLoadingDoc(false)} />
          </div>
        </>
      )}

      {doc && <Assistant htmlContent={doc.html_content} />}
      <SelectionTooltip />
      {doc && <ZoomControl zoom={zoom} setZoom={setZoom} />}
    </div>
  );
}
