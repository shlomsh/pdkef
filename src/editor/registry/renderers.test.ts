import { describe, expect, it, beforeEach, vi } from 'vitest';

// registerRenderer/getElementRenderer replaced a static import of the Preact
// node components (ARCH-19: the editor core may not import a tool). This
// guards both ends of that contract: a render before registration is a clear
// error, not a silent blank, and a render after registration returns the
// registered component's vnode. Each `it` re-imports the module fresh so one
// test's registration can never leak into another's "before registration"
// assertion.
describe('registry/renderers registerRenderer/getElementRenderer', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws a clear error when a registerable type has no registered component yet', async () => {
    const { getElementRenderer } = await import('./renderers.ts');
    expect(() => getElementRenderer('text')({
      element: { id: '1', type: 'text', pageIndex: 0, left: 0, top: 0, text: '' } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    })).toThrow(/No renderer registered for element type "text"/);
  });

  it('renders the registered component once registerRenderer has run', async () => {
    const { getElementRenderer, registerRenderer } = await import('./renderers.ts');
    function FakeTextNode() { return null; }
    registerRenderer('text', FakeTextNode as any);
    const vnode = getElementRenderer('text')({
      element: { id: '1', type: 'text', pageIndex: 0, left: 0, top: 0, text: '' } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    }) as any;
    expect(vnode.type).toBe(FakeTextNode);
    expect(vnode.props.element.id).toBe('1');
  });

  it('never requires a registered component for blackout/blur, or for whiteout targeting redact', async () => {
    const { getElementRenderer } = await import('./renderers.ts');
    expect(() => getElementRenderer('blackout')({
      element: { id: '1', type: 'blackout', pageIndex: 0, left: 0, top: 0, width: 10, height: 10 } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    })).not.toThrow();
    expect(() => getElementRenderer('blur')({
      element: { id: '1', type: 'blur', pageIndex: 0, left: 0, top: 0, width: 10, height: 10 } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    })).not.toThrow();
    expect(() => getElementRenderer('whiteout')({
      element: { id: '1', type: 'whiteout', pageIndex: 0, left: 0, top: 0, width: 10, height: 10 } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
      renderTarget: 'redact',
    })).not.toThrow();
  });

  it('still throws for whiteout when it is not targeting redact and nothing registered it', async () => {
    const { getElementRenderer } = await import('./renderers.ts');
    expect(() => getElementRenderer('whiteout')({
      element: { id: '1', type: 'whiteout', pageIndex: 0, left: 0, top: 0, width: 10, height: 10 } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    })).toThrow(/No renderer registered for element type "whiteout"/);
  });
});
