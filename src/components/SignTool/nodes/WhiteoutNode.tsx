import ElementResizers from '../../ElementResizers.tsx';
import { DEFAULT_WHITEOUT_COLOR } from '../../../constants/signGeometry.js';

export default function WhiteoutNode({ element, isActive, onResizeStart }: { element: any; isActive: boolean; onResizeStart: (...args: any[]) => void }) {
  return (
    <>
      <div style={{ width: '100%', height: '100%', backgroundColor: element.color || DEFAULT_WHITEOUT_COLOR }} />
      <ElementResizers 
        element={element}
        isActive={isActive}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
