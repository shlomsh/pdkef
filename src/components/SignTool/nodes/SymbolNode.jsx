import ElementResizers from '../../ElementResizers.jsx';

export default function SymbolNode({ element, isActive, onResizeStart }) {
  const renderSymbol = () => {
    switch (element.symbolType) {
      case 'check':
        return <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />;
      case 'cross':
        return <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />;
      default:
        return null;
    }
  };

  return (
    <>
      <div style={{ width: '100%', height: '100%', color: element.color || '#1463ff' }}>
        <svg viewBox="0 0 24 24" style={{ width: '100%', height: '100%', display: 'block' }}>
          {renderSymbol()}
        </svg>
      </div>
      <ElementResizers 
        element={element}
        isActive={isActive}
        isShape={false}
        isLine={false}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
