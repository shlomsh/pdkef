import { describe, expect, it } from 'vitest';
import { createElementRenderers } from './renderers.ts';

// createElementRenderers() replaced a static import of the Preact node
// components (ARCH-19: the editor core may not import a tool). This guards
// both ends of that contract: a render for a type whose component was not
// supplied is a clear error, not a silent blank, and a render for a supplied
// type returns that component's vnode. Each factory call is independent, so
// one call's components can never leak into another's "no component" case.
describe('registry/renderers createElementRenderers', () => {
  it('throws a clear error when a registerable type has no supplied component', () => {
    const renderers = createElementRenderers({});
    expect(() => renderers.text({
      element: { id: '1', type: 'text', pageIndex: 0, left: 0, top: 0, text: '' } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    })).toThrow(/No renderer registered for element type "text"/);
  });

  it('renders the supplied component for a registerable type', () => {
    function FakeTextNode() { return null; }
    const renderers = createElementRenderers({ text: FakeTextNode as any });
    const vnode = renderers.text({
      element: { id: '1', type: 'text', pageIndex: 0, left: 0, top: 0, text: '' } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    }) as any;
    expect(vnode.type).toBe(FakeTextNode);
    expect(vnode.props.element.id).toBe('1');
  });

  it('never requires a supplied component for blackout/blur, or for whiteout targeting redact', () => {
    const renderers = createElementRenderers({});
    expect(() => renderers.blackout({
      element: { id: '1', type: 'blackout', pageIndex: 0, left: 0, top: 0, width: 10, height: 10 } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    })).not.toThrow();
    expect(() => renderers.blur({
      element: { id: '1', type: 'blur', pageIndex: 0, left: 0, top: 0, width: 10, height: 10 } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    })).not.toThrow();
    expect(() => renderers.whiteout({
      element: { id: '1', type: 'whiteout', pageIndex: 0, left: 0, top: 0, width: 10, height: 10 } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
      renderTarget: 'redact',
    })).not.toThrow();
  });

  it('still throws for whiteout when it is not targeting redact and no component was supplied', () => {
    const renderers = createElementRenderers({});
    expect(() => renderers.whiteout({
      element: { id: '1', type: 'whiteout', pageIndex: 0, left: 0, top: 0, width: 10, height: 10 } as any,
      onChange: () => {},
      onSelect: () => {},
      pageWidthPoints: 600,
    })).toThrow(/No renderer registered for element type "whiteout"/);
  });
});
