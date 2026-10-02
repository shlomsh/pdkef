import ElementResizers from '../../../../editor-ui/ElementResizers.tsx';
import { DEFAULT_WHITEOUT_COLOR } from '../../../../constants/signGeometry.js';
import type { WhiteoutElement } from '../../../../editor/model/editorModel.ts';
import type { ElementNodeProps } from '../nodeProps.ts';

export default function WhiteoutNode({ element, isActive, onResizeStart, messages }: ElementNodeProps<WhiteoutElement>) {
  return (
    <>
      {/* WhiteoutColorControls paints this fill live while a colour is being picked. */}
      <div data-whiteout-fill style={{ width: '100%', height: '100%', backgroundColor: element.color || DEFAULT_WHITEOUT_COLOR }} />
      <ElementResizers
        element={element}
        isActive={isActive}
        onResizeStart={onResizeStart}
        messages={messages}
      />
    </>
  );
}
