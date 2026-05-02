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

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  return (
    <div
      onMouseEnter={interact}
      onMouseMove={interact}
      onTouchStart={interact}
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: isMobile ? '80px' : '24px',
        zIndex: 9990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: 'white',
        fontSize: isMobile ? '12px' : '14px',
        fontWeight: 500,
        borderRadius: '999px',
        padding: isMobile ? '6px 10px' : '8px 16px',
        gap: isMobile ? '8px' : '12px',
        transition: 'opacity 0.3s ease',
        opacity,
      }}
    >
      <button
        onClick={() => setZoom(z => Number(Math.max(0.7, z - 0.1).toFixed(1)))}
        style={{
          background: 'transparent',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          minWidth: isMobile ? '36px' : '28px',
          minHeight: isMobile ? '36px' : '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        −
      </button>
      <span
        onDoubleClick={() => setZoom(1.0)}
        style={{
          minWidth: isMobile ? '36px' : '44px',
          textAlign: 'center',
          cursor: 'default',
          userSelect: 'none',
          display: windowWidth < 380 ? 'none' : 'block',
        }}
      >
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={() => setZoom(z => Number(Math.min(2.0, z + 0.1).toFixed(1)))}
        style={{
          background: 'transparent',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          minWidth: isMobile ? '36px' : '28px',
          minHeight: isMobile ? '36px' : '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        +
      </button>
    </div>
  );
}
