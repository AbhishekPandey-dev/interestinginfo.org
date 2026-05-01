import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Loader2 } from 'lucide-react';
import { fixDocxImages } from '../lib/fixDocxImages';

interface DocxViewProps {
  fileUrl: string;
  className?: string;
  onReady?: () => void;
}

async function fetchWithCache(url: string): Promise<ArrayBuffer> {
  const CACHE_NAME = 'docx-cache-v1';
  const cache = await caches.open(CACHE_NAME);
  
  // Check if we have a cached version
  const cachedResponse = await cache.match(url);
  if (cachedResponse) {
    console.log('[Cache] Serving document from cache');
    return await cachedResponse.arrayBuffer();
  }
  
  // Not in cache — fetch from network
  console.log('[Cache] Fetching document from network');
  const response = await fetch(url, {
    cache: 'no-cache',
    mode: 'cors',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.status}`);
  }
  
  // Store in cache for next visit
  const responseToCache = response.clone();
  await cache.put(url, responseToCache);
  
  return await response.arrayBuffer();
}

export function DocxView({ fileUrl, className, onReady }: DocxViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const rawBuffer = await fetchWithCache(fileUrl);
        if (cancelled || !containerRef.current) return;

        // Fix unsupported image formats (WDP/JXR) before rendering
        const fixedBuffer = await fixDocxImages(rawBuffer);

        containerRef.current.innerHTML = '';
        await renderAsync(fixedBuffer, containerRef.current, undefined, {
          className: 'docx-render',
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreLastRenderedPageBreak: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
        });
        if (!cancelled) {
          setLoading(false);
          if (onReady) onReady();
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div 
        ref={containerRef} 
        className="docx-container" 
        style={{ 
          colorScheme: 'light',
          overflow: 'visible',
          width: '100%'
        }} 
      />
    </div>
  );
}
