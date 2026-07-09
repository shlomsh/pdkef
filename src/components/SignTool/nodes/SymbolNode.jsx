import ElementResizers from '../../ElementResizers.jsx';
import { DEFAULT_COLOR_BLUE } from '../../../constants/signGeometry.js';

export default function SymbolNode({ element, isActive, onResizeStart }) {
  const renderSymbol = () => {
    const mark = element.mark || (element.symbolType === 'cross' ? 'x' : element.symbolType) || 'check';
    switch (mark) {
      case 'check':
        return <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />;
      case 'x':
        return <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />;
      case 'dot':
        return <circle cx="12" cy="12" r="8" fill="currentColor" />;
      default:
        return null;
    }
  };

  return (
    <>
      <div style={{ width: '100%', height: '100%', color: element.color || DEFAULT_COLOR_BLUE }}>
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
