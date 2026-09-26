import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FillLayer from './FillLayer.tsx';
import FocusProxy from './FocusProxy.tsx';
import { FillContext, FILL_OFF, useTextFill } from './FillContext.tsx';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import styles from './fill.module.css';
import { FILL_INPUT_ATTR, FILL_KEY_ATTR, textFillKey } from './fillTypes.ts';
import type { FillItem, FillSlot, EnterKeyHint } from './fillTypes.ts';

/**
 * FillLayer.tsx's own unit tests (SNG-15): item order, per-item hint and aimed
 * state, the Enter and blur wiring FieldSlot and the text stub both carry, and the
 * pending-focus handoff from the focus proxy. FocusProxy.tsx is small enough to
 * cover in the same file rather than its own.
 */

function fillSlotFixture(overrides: Partial<FillSlot> = {}): FillSlot {
  return {
    key: 'slot:0:12.50:30.00',
    pageIndex: 0,
    field: null,
    placement: {
      box: { left: 12.5, top: 30, width: 40, height: 6 },
      fontSize: 12,
      fontFamily: 'Arimo',
    },
    ...overrides,
  };
}

function slotItem(key: string, overrides: Partial<FillSlot> = {}): FillItem {
  return { kind: 'slot', key, slot: fillSlotFixture({ key, ...overrides }) };
}

function textItem(id: string): FillItem {
  return {
    kind: 'text',
    key: textFillKey(id),
    element: { id, type: 'text', pageIndex: 0, left: 5, top: 5, text: 'Hello' } as any,
  };
}

// Stands in for TextNode: reads TextFillContext exactly as the real renderer
// does, so FillLayer's own wiring is exercised without pulling in the editor's
// text rendering.
function TextStub() {
  const fill = useTextFill();
  if (!fill) return null;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') fill.onEnter();
  };
  return <textarea data-fill-input data-fill-key={fill.fillKey} data-hint={fill.enterKeyHint} onKeyDown={handleKeyDown} />;
}

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector} to be rendered`);
  return element;
}

function requireAll<T extends Element>(parent: ParentNode, selector: string): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

// Same convention FieldSlot.test.tsx uses: a host tagged as the real page
// wrapper, with a mocked, realistic rect, so FieldSlot's own scale-factor
// effect measures something rather than jsdom's default 0x0 (editor.md's
// geometry-test rule).
function mountHost(vnode: ComponentChildren): HTMLDivElement {
  const el = document.createElement('div');
  el.className = workspaceStyles['page-wrapper'];
  el.getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
  document.body.appendChild(el);
  act(() => {
    render(vnode, el);
  });
  return el;
}

describe('FillLayer component', () => {
  let host = document.createElement('div');

  afterEach(() => {
    if (host.isConnected) {
      act(() => render(null, host));
      document.body.removeChild(host);
    }
  });

  function renderLayer(props: {
    items: FillItem[];
    aimedKey?: string | null;
    pendingFocusKey?: string | null;
    enterKeyHintOf?: (key: string) => EnterKeyHint;
  }) {
    const setPendingFocusKey = vi.fn();
    const closeFreeSlot = vi.fn();
    const onEnter = vi.fn();
    const onCommitSlot = vi.fn();
    // A plain, non-comb text element with no explicit direction is enough
    // for FillLayer's own tests: FieldSlot.test.tsx covers what elementOf
    // actually drives (comb preview, direction).
    const slotElementOf = (slot: FillSlot, text: string) =>
      ({ id: 'fill-slot-preview', type: 'text', pageIndex: slot.pageIndex, left: 0, top: 0, text } as any);
    host = mountHost(
      <FillContext.Provider
        value={{
          ...FILL_OFF,
          enabled: true,
          aimedKey: props.aimedKey ?? null,
          pendingFocusKey: props.pendingFocusKey ?? null,
          setPendingFocusKey,
          closeFreeSlot,
        }}
      >
        <FillLayer
          items={props.items}
          pageWidthPoints={600}
          enterKeyHintOf={props.enterKeyHintOf ?? (() => 'next')}
          slotLabel="Fill field"
          renderText={() => <TextStub />}
          onEnter={onEnter}
          onCommitSlot={onCommitSlot}
          slotElementOf={slotElementOf}
        />
      </FillContext.Provider>
    );
    return { setPendingFocusKey, closeFreeSlot, onEnter, onCommitSlot };
  }

  it('renders items in the given order', () => {
    const items = [slotItem('slot:a'), textItem('el-1'), slotItem('slot:b')];
    renderLayer({ items });

    const inputs = requireAll<HTMLElement>(host, `[${FILL_INPUT_ATTR}]`);
    expect(inputs.map((el) => el.getAttribute(FILL_KEY_ATTR))).toEqual(['slot:a', textFillKey('el-1'), 'slot:b']);
  });

  it("resolves each fill input's hint through enterKeyHintOf", () => {
    const items = [slotItem('slot:a'), textItem('el-1')];
    const lastKey = textFillKey('el-1');
    renderLayer({ items, enterKeyHintOf: (key) => (key === lastKey ? 'done' : 'next') });

    const slotInput = requireElement<HTMLInputElement>(host, 'input[data-fill-key="slot:a"]');
    expect(slotInput.getAttribute('enterkeyhint')).toBe('next');
    const textInput = requireElement<HTMLTextAreaElement>(host, 'textarea[data-fill-key]');
    expect(textInput.dataset.hint).toBe('done');
  });

  it('sets the aimed class only on the slot matching aimedKey', () => {
    const items = [slotItem('slot:a'), slotItem('slot:b')];
    renderLayer({ items, aimedKey: 'slot:b' });

    const a = requireElement<HTMLInputElement>(host, 'input[data-fill-key="slot:a"]');
    const b = requireElement<HTMLInputElement>(host, 'input[data-fill-key="slot:b"]');
    expect(a.classList.contains(styles.aimed)).toBe(false);
    expect(b.classList.contains(styles.aimed)).toBe(true);
  });

  describe('Enter moves focus by key', () => {
    it("calls onEnter with the slot's key", () => {
      const items = [slotItem('slot:a')];
      const { onEnter } = renderLayer({ items });
      const input = requireElement<HTMLInputElement>(host, 'input[data-fill-key="slot:a"]');

      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });

      expect(onEnter).toHaveBeenCalledWith('slot:a');
    });

    it('calls onEnter with the "el:<id>" key from the text stub', () => {
      const items = [textItem('el-9')];
      const { onEnter } = renderLayer({ items });
      const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea[data-fill-key]');

      act(() => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });

      expect(onEnter).toHaveBeenCalledWith(textFillKey('el-9'));
    });
  });

  it('calls onCommitSlot with the slot and the trimmed text on a filled blur', () => {
    const items = [slotItem('slot:a')];
    const { onCommitSlot } = renderLayer({ items });
    const input = requireElement<HTMLInputElement>(host, 'input[data-fill-key="slot:a"]');

    act(() => {
      input.value = 'Shlomi';
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });

    expect(onCommitSlot).toHaveBeenCalledTimes(1);
    const [slotArg, textArg] = onCommitSlot.mock.calls[0];
    expect(slotArg.key).toBe('slot:a');
    expect(textArg).toBe('Shlomi');
  });

  describe('leaving a slot', () => {
    it('closes the free slot on blur when the slot has no detected field', () => {
      const items = [slotItem('slot:free', { field: null })];
      const { closeFreeSlot } = renderLayer({ items });
      const input = requireElement<HTMLInputElement>(host, 'input[data-fill-key="slot:free"]');

      act(() => {
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      });

      expect(closeFreeSlot).toHaveBeenCalledTimes(1);
    });

    it('does not close the free slot on blur when the slot has a detected field', () => {
      const items = [slotItem('slot:detected', { field: {} as any })];
      const { closeFreeSlot } = renderLayer({ items });
      const input = requireElement<HTMLInputElement>(host, 'input[data-fill-key="slot:detected"]');

      act(() => {
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      });

      expect(closeFreeSlot).not.toHaveBeenCalled();
    });
  });

  describe('pending focus', () => {
    it('focuses the rendered slot and clears pendingFocusKey', () => {
      const items = [slotItem('slot:a'), slotItem('slot:b')];
      const { setPendingFocusKey } = renderLayer({ items, pendingFocusKey: 'slot:b' });
      const b = requireElement<HTMLInputElement>(host, 'input[data-fill-key="slot:b"]');

      expect(document.activeElement).toBe(b);
      expect(setPendingFocusKey).toHaveBeenCalledWith(null);
    });

    it('focuses nothing and leaves pendingFocusKey alone when the key is not among the items', () => {
      const items = [slotItem('slot:a')];
      const { setPendingFocusKey } = renderLayer({ items, pendingFocusKey: 'slot:missing' });
      const a = requireElement<HTMLInputElement>(host, 'input[data-fill-key="slot:a"]');

      expect(document.activeElement).not.toBe(a);
      expect(setPendingFocusKey).not.toHaveBeenCalled();
    });
  });
});

describe('FocusProxy component', () => {
  let host = document.createElement('div');

  afterEach(() => {
    if (host.isConnected) {
      act(() => render(null, host));
      document.body.removeChild(host);
    }
  });

  it('renders a hidden input carrying the given proxyRef', () => {
    const proxyRef = { current: null as HTMLInputElement | null };
    host = mountHost(
      <FillContext.Provider value={{ ...FILL_OFF, enabled: true, proxyRef }}>
        <FocusProxy />
      </FillContext.Provider>
    );

    const input = requireElement<HTMLInputElement>(host, 'input');
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute('aria-hidden')).toBe('true');
    expect(input.classList.contains(styles.proxy)).toBe(true);
    expect(proxyRef.current).toBe(input);
  });
});
