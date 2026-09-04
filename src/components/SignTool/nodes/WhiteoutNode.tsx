import ElementResizers from '../../ElementResizers.tsx';
import { DEFAULT_WHITEOUT_COLOR } from '../../../constants/signGeometry.js';
import type { WhiteoutElement } from '../../../editor/model/editorModel.ts';
import type { ElementNodeProps } from '../nodeProps.ts';

export default function WhiteoutNode({ element, isActive, onResizeStart }: ElementNodeProps<WhiteoutElement>) {
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
