import ElementResizers from '../../ElementResizers.tsx';
import { DEFAULT_COLOR_BLUE } from '../../../constants/signGeometry.js';
import { DESIGN_BOX, markGeometry, markPathData } from '../../../editor/registry/symbolMarks.ts';
import type { SymbolElement, SymbolMark } from '../../../editor/model/editorModel.ts';
import type { ElementNodeProps } from '../nodeProps.ts';

export default function SymbolNode({ element, isActive, onResizeStart }: ElementNodeProps<SymbolElement>) {
  // Geometry comes from symbolMarks.ts, which the exporter draws from too. The
  // two used to carry their own copies and had drifted: this cross was a third
  // smaller on screen than the one in the downloaded file.
  const mark = (element.mark
    || (element.symbolType === 'cross' ? 'x' : element.symbolType)
    || 'check') as SymbolMark;
  const geometry = markGeometry(mark);

  const renderSymbol = () => {
    if (geometry.disc) {
      return <circle cx={geometry.disc.cx} cy={geometry.disc.cy} r={geometry.disc.r} fill="currentColor" />;
    }
    return (
      <path
        d={markPathData(mark)}
        fill="none"
        stroke="currentColor"
        stroke-width={geometry.thickness}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    );
  };

  return (
    <>
      <div style={{ width: '100%', height: '100%', color: element.color || DEFAULT_COLOR_BLUE }}>
        <svg viewBox={`0 0 ${DESIGN_BOX} ${DESIGN_BOX}`} style={{ width: '100%', height: '100%', display: 'block' }}>
          {renderSymbol()}
        </svg>
      </div>
      <ElementResizers 
        element={element}
        isActive={isActive}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
