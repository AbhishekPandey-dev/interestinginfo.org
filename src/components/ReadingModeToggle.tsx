import { useState, useEffect } from 'react'
import { Sun, BookOpen } from 'lucide-react'

export function ReadingModeToggle() {
  const [reading, setReading] = useState(() => {
    return localStorage.getItem('reading-mode') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('reading-mode', String(reading))
  }, [reading])

  return (
    <>
      {/* Warm sepia overlay — covers entire viewport, pointer-events none so clicks pass through */}
      {reading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(255, 201, 100, 0.20)',
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
            zIndex: 9997,
          }}
        />
      )}

      {/* Toggle button — fixed top right */}
      <button
        onClick={() => setReading(r => !r)}
        title={reading ? 'Reading mode on — click to turn off' : 'Turn on reading mode'}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 9990,
          width: 40,
          height: 40,
          minWidth: 40,
          minHeight: 40,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: reading ? '#f5a623' : 'rgba(0,0,0,0.08)',
          color: reading ? '#ffffff' : '#555555',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          transition: 'all 0.2s ease',
        }}
      >
        {reading ? <BookOpen size={18} /> : <Sun size={18} />}
      </button>
    </>
  )
}
