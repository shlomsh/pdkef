import ElementResizers from '../../ElementResizers.jsx';
import { DEFAULT_WHITEOUT_COLOR } from '../../../constants/signGeometry.js';

export default function WhiteoutNode({ element, isActive, onResizeStart }) {
  return (
    <>
      <div style={{ width: '100%', height: '100%', backgroundColor: element.color || DEFAULT_WHITEOUT_COLOR }} />
      <ElementResizers 
        element={element}
        isActive={isActive}
        isShape={true}
        isLine={false}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
