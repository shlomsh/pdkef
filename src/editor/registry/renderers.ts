import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import type { ElementType } from '../model/editorModel.ts';
import type { ElementForType, NodeRenderContext } from './types.ts';
import TextNode from '../../components/SignTool/nodes/TextNode.tsx';
import ShapeNode from '../../components/SignTool/nodes/ShapeNode.tsx';
import LineNode from '../../components/SignTool/nodes/LineNode.tsx';
import SignatureNode from '../../components/SignTool/nodes/SignatureNode.tsx';
import SymbolNode from '../../components/SignTool/nodes/SymbolNode.tsx';
import WhiteoutNode from '../../components/SignTool/nodes/WhiteoutNode.tsx';
import { renderRedactionSurface } from './redactionSurface.ts';

// isActive/isEditing/onBeginEdit/onResizeStart below are all placeholders:
// DraggableWrapper injects the real values via cloneElement, the same channel
// resize-start events arrive on.
//
// Split out of the registry's per-type modules (registry/text.ts etc.) so that
// resize/serialize consumers never have to load Preact node components. Before
// this split, every type's render() imported its Node component, and every
// Node component but blackout/blur's imports ElementResizers.tsx, which imports
// getElementDefinition from registry/index.ts - which imports every per-type
// module, closing a cycle back to the type that started it
// (registry/text.ts -> TextNode.tsx -> ElementResizers.tsx -> registry/index.ts
// -> registry/text.ts). Rendering now lives only here, so ElementResizers'
// need for getElementDefinition().resizeBehavior no longer reaches back into
// any module that imports a Node component.
const renderers: { [K in ElementType]: (context: NodeRenderContext<ElementForType<K>>) => ComponentChildren } = {
  text: ({ element, onChange, onSelect, pageWidthPoints }) => h(TextNode, { element, onChange, onSelect, pageWidthPoints, isActive: false, isEditing: false, onBeginEdit: () => {}, onResizeStart: () => {} }),
  rectangle: ({ element }) => h(ShapeNode, { element, isActive: false, onResizeStart: () => {} }),
  ellipse: ({ element }) => h(ShapeNode, { element, isActive: false, onResizeStart: () => {} }),
  line: ({ element }) => h(LineNode, { element, isActive: false, onResizeStart: () => {}, handlePointerDown: () => {} }),
  symbol: ({ element }) => h(SymbolNode, { element, isActive: false, onResizeStart: () => {} }),
  signature: ({ element }) => h(SignatureNode, { element, isActive: false, onResizeStart: () => {} }),
  whiteout: ({ element, renderTarget }) => renderTarget === 'redact'
    ? renderRedactionSurface('whiteout', element.color)
    : h(WhiteoutNode, { element, isActive: false, onResizeStart: () => {} }),
  blackout: ({ element }) => renderRedactionSurface('blackout', element.color),
  blur: () => renderRedactionSurface('blur'),
};

export function getElementRenderer<K extends ElementType>(type: K): (context: NodeRenderContext<ElementForType<K>>) => ComponentChildren {
  return renderers[type];
}
