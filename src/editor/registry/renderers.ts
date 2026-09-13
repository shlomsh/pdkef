import { h } from 'preact';
import type { ComponentChildren, ComponentType } from 'preact';
import type { ElementType, SignToolType } from '../model/editorModel.ts';
import type { ElementForType, NodeRenderContext } from './types.ts';
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
//
// ARCH-19: the registry used to import the Preact node components directly
// from Sign's own node-component folder, an editor -> tool edge the module
// boundary rules forbid. Inverted here: the core exposes `registerRenderer`,
// and each tool's entry point registers its own node components before the
// first render (Sign's `PdfWorkspace.tsx` does this for all seven types it
// draws; Redact never renders a registered component - its whiteout/blackout/
// blur elements always take the `renderTarget: 'redact'` branch below, which
// is core-only). `getElementRenderer` throws a clear error if something tries
// to render a registerable type before its component has landed.
const nodeComponents: Partial<Record<SignToolType, ComponentType<any>>> = {};

export function registerRenderer(type: SignToolType, component: ComponentType<any>): void {
  nodeComponents[type] = component;
}

function requireComponent(type: SignToolType): ComponentType<any> {
  const component = nodeComponents[type];
  if (!component) {
    throw new Error(
      `No renderer registered for element type "${type}". A tool must call `
      + `registerRenderer('${type}', Component) from its entry point before rendering it.`,
    );
  }
  return component;
}

const renderers: { [K in ElementType]: (context: NodeRenderContext<ElementForType<K>>) => ComponentChildren } = {
  text: ({ element, onChange, onSelect, pageWidthPoints, messages }) => h(requireComponent('text'), { element, onChange, onSelect, pageWidthPoints, messages, isActive: false, isEditing: false, onBeginEdit: () => {}, onResizeStart: () => {} }),
  rectangle: ({ element, messages }) => h(requireComponent('rectangle'), { element, messages, isActive: false, onResizeStart: () => {} }),
  ellipse: ({ element, messages }) => h(requireComponent('ellipse'), { element, messages, isActive: false, onResizeStart: () => {} }),
  line: ({ element, messages }) => h(requireComponent('line'), { element, messages, isActive: false, onResizeStart: () => {}, handlePointerDown: () => {} }),
  symbol: ({ element, messages }) => h(requireComponent('symbol'), { element, messages, isActive: false, onResizeStart: () => {} }),
  signature: ({ element, messages }) => h(requireComponent('signature'), { element, messages, isActive: false, onResizeStart: () => {} }),
  whiteout: ({ element, renderTarget, messages }) => renderTarget === 'redact'
    ? renderRedactionSurface('whiteout', element.color)
    : h(requireComponent('whiteout'), { element, messages, isActive: false, onResizeStart: () => {} }),
  blackout: ({ element }) => renderRedactionSurface('blackout', element.color),
  blur: () => renderRedactionSurface('blur'),
};

export function getElementRenderer<K extends ElementType>(type: K): (context: NodeRenderContext<ElementForType<K>>) => ComponentChildren {
  return renderers[type];
}
