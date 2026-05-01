import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Loader2 } from 'lucide-react';

interface DocxViewProps {
  fileUrl: string;
  className?: string;
}

export function DocxView({ fileUrl, className }: DocxViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(fileUrl, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Failed to fetch document (${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        await renderAsync(buf, containerRef.current, undefined, {
          className: 'docx-render',
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreLastRenderedPageBreak: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
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
