import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Loader2 } from 'lucide-react';
import { fixDocxImages } from '../lib/fixDocxImages';

interface DocxViewProps {
  fileUrl: string;
  className?: string;
}

export function DocxView({ fileUrl, className }: DocxViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const styleHostRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create the style host element once and attach it to <head>
  useEffect(() => {
    const host = document.createElement('div');
    host.setAttribute('data-docx-styles', 'true');
    document.head.appendChild(host);
    styleHostRef.current = host;
    return () => {
      document.head.removeChild(host);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Setup MutationObserver to watch for style injections and element creations
    const observer = new MutationObserver((mutations) => {
      if (cancelled) return;

      // 1. Force override any injected <style> tags that contain wrapper styles
      const allStyles = document.querySelectorAll('style');
      allStyles.forEach((styleEl) => {
        const txt = styleEl.textContent || '';
        if (
          txt.includes('docx-render-wrapper') ||
          txt.includes('docx-wrapper') ||
          (txt.includes('background') && (txt.includes('gray') || txt.includes('grey') || txt.includes('#d4d4d4')))
        ) {
          const patched = txt.replace(/(\.docx-render-wrapper|\.docx-wrapper)\s*\{([^}]*)\}/g, (_m, cls, body) => {
            const fixed = body
              .replace(/background\s*:[^;]+;/gi, 'background: white !important;')
              .replace(/padding\s*:[^;]+;/gi, 'padding: 0 !important;')
              .replace(/box-shadow\s*:[^;]+;/gi, 'box-shadow: none !important;')
              .replace(/outline\s*:[^;]+;/gi, 'outline: none !important;')
              .replace(/display\s*:\s*flex\s*;/gi, 'display: block !important;')
              .replace(/flex-flow\s*:[^;]+;/gi, '')
              .replace(/align-items\s*:[^;]+;/gi, '');
            return `${cls} { ${fixed} }`;
          });
          if (patched !== txt) {
            styleEl.textContent = patched;
          }
        }
      });

      // 2. Target elements directly in the DOM to strip library styles (including inline ones)
      if (containerRef.current) {
        const wrappers = containerRef.current.querySelectorAll('.docx-render-wrapper, .docx-wrapper');
        wrappers.forEach((el: any) => {
          el.style.background = 'white';
          el.style.padding = '0';
          el.style.margin = '0';
          el.style.boxShadow = 'none';
          el.style.outline = 'none';
          el.style.display = 'block';
        });

        const docSections = containerRef.current.querySelectorAll('section.docx');
        docSections.forEach((el: any) => {
          el.style.boxShadow = 'none';
          el.style.border = 'none';
          el.style.outline = 'none';
          // Ensure our custom padding from index.css wins if inline styles exist
          if (el.style.padding) el.style.padding = ''; 
        });
      }
    });

    observer.observe(document.head, { childList: true, subtree: true });
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true });
    }

    (async () => {
      try {
        const response = await fetch(fileUrl, {
          cache: 'no-cache',
          mode: 'cors',
        });
        if (!response.ok) throw new Error(`Failed to fetch document (${response.status})`);
        const rawBuffer = await response.arrayBuffer();
        if (cancelled || !containerRef.current) return;

        const fixedBuffer = await fixDocxImages(rawBuffer);

        containerRef.current.innerHTML = '';

        await renderAsync(fixedBuffer, containerRef.current, styleHostRef.current ?? undefined, {
          className: 'docx-render',
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreLastRenderedPageBreak: true,
          useBase64URL: true,
          renderHeaders: false,
          renderFooters: false,
          renderFootnotes: false,
        });

        if (!cancelled) setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to render document');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [fileUrl]);

  return (
    <div className={className}>
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {error && !loading && (
        <div className="text-sm text-destructive py-8 text-center">{error}</div>
      )}
      <div ref={containerRef} className="docx-container" />
    </div>
  );
}
