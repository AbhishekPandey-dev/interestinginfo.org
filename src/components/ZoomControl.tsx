import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';

const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2;
const STEP = 0.1;
const DEFAULT_ZOOM = 1;

interface ZoomControlProps {
  zoom: number;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
}

function clampZoom(value: number) {
  return Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)).toFixed(1));
}

export function ZoomControl({ zoom, setZoom }: ZoomControlProps) {
  const [idle, setIdle] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

  const wake = useCallback(() => {
    setIdle(false);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      setIdle(true);
    }, 3200);
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((current) => clampZoom(current - STEP));
    wake();
  }, [setZoom, wake]);

  const zoomIn = useCallback(() => {
    setZoom((current) => clampZoom(current + STEP));
    wake();
  }, [setZoom, wake]);

  const resetZoom = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
    wake();
  }, [setZoom, wake]);

  useEffect(() => {
    wake();
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [zoom, wake]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      if (!event.ctrlKey && !event.metaKey) return;

      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        zoomIn();
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomOut();
      } else if (event.key === '0') {
        event.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetZoom, zoomIn, zoomOut]);

  return (
    <div
      className={`zoom-control ${idle ? 'zoom-control-idle' : ''}`}
      onMouseEnter={wake}
      onMouseMove={wake}
      onTouchStart={wake}
      onFocus={wake}
      aria-label="Document zoom controls"
    >
      <button
        className="zoom-control-button"
        onClick={zoomOut}
        disabled={zoom <= MIN_ZOOM}
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus size={16} />
      </button>

      <button
        className="zoom-control-value"
        onClick={resetZoom}
        type="button"
        aria-label="Reset zoom to 100 percent"
        title="Reset zoom"
      >
        <span>{Math.round(zoom * 100)}%</span>
        {zoom !== DEFAULT_ZOOM && <RotateCcw size={12} aria-hidden="true" />}
      </button>

      <button
        className="zoom-control-button"
        onClick={zoomIn}
        disabled={zoom >= MAX_ZOOM}
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
