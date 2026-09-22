import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import ElementResizers from '../../../../editor-ui/ElementResizers.tsx';
import { DEFAULT_COLOR_BLUE } from '../../../../constants/signGeometry.js';
import { DESIGN_BOX, markGeometry, markPathData } from '../../../../editor/registry/symbolMarks.ts';
import type { SymbolElement, SymbolMark } from '../../../../editor/model/editorModel.ts';
import type { ElementNodeProps } from '../nodeProps.ts';

export default function SymbolNode({ element, isActive, onResizeStart, messages }: ElementNodeProps<SymbolElement>) {
  // Geometry comes from symbolMarks.ts, which the exporter draws from too. The
  // two used to carry their own copies and had drifted: this cross was a third
  // smaller on screen than the one in the downloaded file.
  const mark = (element.mark
    || (element.symbolType === 'cross' ? 'x' : element.symbolType)
    || 'check') as SymbolMark;
  const geometry = markGeometry(mark);

  // Reported live: a symbol tapped onto a detected printed checkbox (as
  // opposed to one freshly placed from the toolbar, which defaults to a
  // usable size) is sized to match the print - a few px on a phone - and its
  // four corner handles, fixed at 10px each, rendered as one solid blob (the
  // same class of bug as MOBI-19's text handles, confirmed with real
  // rendered measurements: a real checkbox at 4.28x4.28px put every handle
  // pair at roughly -7px of overlap). `[data-editor-text] .resizer`'s
  // shrink-and-separate formula in EditorElement.module.css does the same
  // job here under `.symbol .resizer`, fed by this element's own measured
  // size instead of a single box height, since a symbol resizes in both
  // directions rather than growing one line at a time. Same ResizeObserver
  // pattern as TextNode.tsx's own measurement effects - ordinary layout
  // measurement, not the golden-rule gesture path (editor.md), since nothing
  // here writes back to `onChange`/state.
  const symbolRef = useRef<HTMLDivElement | null>(null);
  const [halfSize, setHalfSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = symbolRef.current;
    if (!node) return;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setHalfSize({ width: rect.width / 2, height: rect.height / 2 });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
      <div ref={symbolRef} data-editor-symbol-visual style={{ width: '100%', height: '100%', color: element.color || DEFAULT_COLOR_BLUE }}>
        <svg viewBox={`0 0 ${DESIGN_BOX} ${DESIGN_BOX}`} style={{ width: '100%', height: '100%', display: 'block' }}>
          {renderSymbol()}
        </svg>
      </div>
      <ElementResizers
        element={element}
        isActive={isActive}
        onResizeStart={onResizeStart}
        messages={messages}
        style={{ '--half-width': `${halfSize.width}px`, '--half-height': `${halfSize.height}px` }}
      />
    </>
  );
}
