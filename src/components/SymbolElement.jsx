export default function SymbolElement({ element }) {
  return (
    <div style={{ color: element.color || 'var(--color-primary)' }}>
      {element.mark === 'dot' ? (
        <svg width="100%" height="100%" viewBox="0 0 24 24" style={{ position: 'absolute', inset: 0 }} fill="currentColor" stroke="none">
          <circle cx="12" cy="12" r="8" />
        </svg>
      ) : element.mark === 'x' ? (
        <svg width="100%" height="100%" viewBox="0 0 24 24" style={{ position: 'absolute', inset: 0 }} fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <line x1="4" y1="4" x2="20" y2="20" />
          <line x1="20" y1="4" x2="4" y2="20" />
        </svg>
      ) : (
        <svg width="100%" height="100%" viewBox="0 0 24 24" style={{ position: 'absolute', inset: 0 }} fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}
