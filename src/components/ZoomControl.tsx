import { useEffect, useState, useRef, useCallback } from 'react';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const STEP = 0.1;

interface ZoomControlProps {
  zoom: number;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
}

export function ZoomControl({ zoom, setZoom }: ZoomControlProps) {
  const [opacity, setOpacity] = useState(1);
  const hideTimeout = useRef<NodeJS.Timeout>();

  const interact = useCallback(() => {
    setOpacity(1);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      setOpacity(0.3);
    }, 3000);
  }, []);

  useEffect(() => {
    interact();
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [zoom, interact]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }
      
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setZoom(z => Number(Math.min(2.0, z + 0.1).toFixed(1)));
          interact();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setZoom(z => Number(Math.max(0.7, z - 0.1).toFixed(1)));
          interact();
        } else if (e.key === '0') {
          e.preventDefault();
          setZoom(1.0);
          interact();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setZoom, interact]);

  return (
    <div
      onMouseEnter={interact}
      onMouseMove={interact}
      onTouchStart={interact}
      className="fixed left-1/2 -translate-x-1/2 bottom-[80px] md:bottom-[24px] z-[9990] flex items-center justify-center bg-black/75 backdrop-blur-[8px] text-white text-[14px] font-medium rounded-full px-4 py-2 gap-3 transition-opacity duration-300 ease max-[479px]:px-[10px] max-[479px]:py-[6px] max-[479px]:text-[12px]"
      style={{ opacity, WebkitBackdropFilter: 'blur(8px)' }}
    >
      <button
        onClick={() => setZoom(z => Number(Math.max(0.7, z - 0.1).toFixed(1)))}
        className="hover:opacity-70 min-w-[36px] min-h-[36px] md:min-w-[28px] md:min-h-0 flex items-center justify-center text-center"
      >
        −
      </button>
      <span
        onDoubleClick={() => setZoom(1.0)}
        className="min-w-[44px] text-center cursor-default select-none max-[380px]:hidden"
      >
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={() => setZoom(z => Number(Math.min(2.0, z + 0.1).toFixed(1)))}
        className="hover:opacity-70 min-w-[36px] min-h-[36px] md:min-w-[28px] md:min-h-0 flex items-center justify-center text-center"
      >
        +
      </button>
    </div>
  );
}
