export function DocumentSkeleton() {
  return (
    <div style={{
      padding: 'clamp(16px, 5vw, 80px)',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Title line */}
      <div style={{ 
        height: '32px', 
        width: '60%', 
        background: '#e5e7eb', 
        borderRadius: '6px',
        marginBottom: '24px'
      }} />
      
      {/* Subtitle line */}
      <div style={{ 
        height: '20px', 
        width: '40%', 
        background: '#e5e7eb', 
        borderRadius: '4px',
        marginBottom: '32px'
      }} />

      {/* Paragraph lines — vary widths to look like real text */}
      {[100, 95, 88, 100, 72, 95, 83, 100, 90, 78, 100, 85].map((width, i) => (
        <div key={i} style={{ 
          height: '16px', 
          width: `${width}%`, 
          background: '#e5e7eb', 
          borderRadius: '3px',
          marginBottom: '12px'
        }} />
      ))}

      {/* Gap between paragraphs */}
      <div style={{ height: '24px' }} />

      {/* Second paragraph block */}
      {[100, 92, 87, 100, 76, 94].map((width, i) => (
        <div key={i + 20} style={{ 
          height: '16px', 
          width: `${width}%`, 
          background: '#e5e7eb', 
          borderRadius: '3px',
          marginBottom: '12px'
        }} />
      ))}
    </div>
  )
}
