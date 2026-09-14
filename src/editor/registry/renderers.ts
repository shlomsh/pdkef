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
// boundary rules forbid. Inverted here: the core exposes `createElementRenderers`,
// a factory each tool calls once, at module load, with its own node components
// (Sign's `PdfWorkspace.tsx` calls it with all seven types it draws; Redact
// calls it with `{}` - its whiteout/blackout/blur elements always take the
// `renderTarget: 'redact'` branch below, which is core-only and never touches
// a supplied component). The returned map throws a clear error if something
// tries to render a registerable type whose component was not supplied.
//
// The map is typed as `ElementRenderers` (one shared signature) rather than
// the per-type mapped shape built internally below, so a call site can index
// it by a element's own `type` field (a union, not a single literal) without
// TypeScript reducing the call's argument type to `never` - indexing a record
// whose values are all the same type is safe for a union key; indexing one
// whose value type varies per key is not.
export type ElementRenderer = (context: NodeRenderContext<any>) => ComponentChildren;
export type ElementRenderers = Record<ElementType, ElementRenderer>;

export function createElementRenderers(
  nodeComponents: Partial<Record<SignToolType, ComponentType<any>>>,
): ElementRenderers {
  function requireComponent(type: SignToolType): ComponentType<any> {
    const component = nodeComponents[type];
    if (!component) {
      throw new Error(
        `No renderer registered for element type "${type}". Pass a "${type}" `
        + `component to createElementRenderers() from the tool's entry point.`,
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
  return renderers;
}
