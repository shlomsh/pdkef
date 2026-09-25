import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FieldSlot from './FieldSlot.tsx';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import styles from './fill.module.css';
import { FILL_INPUT_ATTR, FILL_KEY_ATTR } from './fillTypes.ts';
import type { FillSlot } from './fillTypes.ts';

function fillSlot(overrides: Partial<FillSlot> = {}): FillSlot {
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

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector} to be rendered`);
  return element;
}

// Same convention TextNode.test.tsx uses: a host tagged as the real page
// wrapper, with a mocked, realistic rect, so the scaleFactor effect measures
// something rather than jsdom's default 0x0 (editor.md's geometry-test rule).
function mount(vnode: ComponentChildren): HTMLDivElement {
  const host = document.createElement('div');
  host.className = workspaceStyles['page-wrapper'];
  host.getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
}

describe('FieldSlot component', () => {
  let host = document.createElement('div');

  afterEach(() => {
    if (host.isConnected) {
      act(() => render(null, host));
      document.body.removeChild(host);
    }
  });

  it('carries the fill DOM contract plus the input attributes docs/sign-fill-mode.md asks for', () => {
    const slot = fillSlot({ key: 'slot:0:5.00:10.00' });
    host = mount(
      <FieldSlot
        slot={slot}
        enterKeyHint="next"
        aimed={false}
        pageWidthPoints={600}
        label="First name"
        onEnter={() => {}}
        onCommit={() => {}}
      />
    );

    const input = requireElement<HTMLInputElement>(host, 'input');
    expect(input.type).toBe('text');
    expect(input.getAttribute(FILL_INPUT_ATTR)).not.toBeNull();
    expect(input.matches(`[${FILL_INPUT_ATTR}]`)).toBe(true);
    expect(input.getAttribute(FILL_KEY_ATTR)).toBe('slot:0:5.00:10.00');
    expect(input.getAttribute('enterkeyhint')).toBe('next');
    expect(input.getAttribute('dir')).toBe('auto');
    expect(input.getAttribute('aria-label')).toBe('First name');
    expect(input.getAttribute('autocomplete')).toBe('off');
  });

  it('sets "done" as the enterkeyhint on the last field, per the enterKeyHint prop', () => {
    host = mount(
      <FieldSlot
        slot={fillSlot()}
        enterKeyHint="done"
        aimed={false}
        pageWidthPoints={600}
        label="Signature date"
        onEnter={() => {}}
        onCommit={() => {}}
      />
    );

    expect(requireElement<HTMLInputElement>(host, 'input').getAttribute('enterkeyhint')).toBe('done');
  });

  describe('Enter', () => {
    it('calls onEnter and prevents the default once, on a plain Enter', () => {
      const onEnter = vi.fn();
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={onEnter}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      act(() => {
        input.dispatchEvent(event);
      });

      expect(onEnter).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('does not call onEnter on Shift+Enter', () => {
      const onEnter = vi.fn();
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={onEnter}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
      act(() => {
        input.dispatchEvent(event);
      });

      expect(onEnter).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('does not call onEnter while an IME composition is in progress', () => {
      const onEnter = vi.fn();
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={onEnter}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
      act(() => {
        input.dispatchEvent(event);
      });

      expect(onEnter).not.toHaveBeenCalled();
    });

    it('ignores a non-Enter key', () => {
      const onEnter = vi.fn();
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={onEnter}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      });

      expect(onEnter).not.toHaveBeenCalled();
    });
  });

  describe('commit on blur', () => {
    it('calls onCommit once, with the trimmed value, when text is left behind', () => {
      const onCommit = vi.fn();
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={() => {}}
          onCommit={onCommit}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      act(() => {
        input.value = '  Shlomi  ';
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      });

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith('Shlomi');
    });

    it('does not call onCommit when the field is left empty', () => {
      const onCommit = vi.fn();
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={() => {}}
          onCommit={onCommit}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      act(() => {
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      });

      expect(onCommit).not.toHaveBeenCalled();
    });

    it('does not call onCommit when the field is left holding only whitespace', () => {
      const onCommit = vi.fn();
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={() => {}}
          onCommit={onCommit}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      act(() => {
        input.value = '   ';
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      });

      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  describe('leaving on blur', () => {
    it('calls onLeave on a blank blur, without calling onCommit', () => {
      const onCommit = vi.fn();
      const onLeave = vi.fn();
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={() => {}}
          onCommit={onCommit}
          onLeave={onLeave}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      act(() => {
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      });

      expect(onLeave).toHaveBeenCalledTimes(1);
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('calls onLeave after onCommit on a filled blur', () => {
      const onCommit = vi.fn();
      const onLeave = vi.fn();
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={() => {}}
          onCommit={onCommit}
          onLeave={onLeave}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      act(() => {
        input.value = 'Shlomi';
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      });

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onLeave).toHaveBeenCalledTimes(1);
      expect(onCommit.mock.invocationCallOrder[0]).toBeLessThan(onLeave.mock.invocationCallOrder[0]);
    });
  });

  describe('position', () => {
    it('places the input from slot.placement.box, in page-percent', () => {
      const slot = fillSlot({ placement: { box: { left: 8, top: 22.5, width: 33.25, height: 4 }, fontSize: 12, fontFamily: 'Arimo' } });
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      expect(input.style.left).toBe('8%');
      expect(input.style.top).toBe('22.5%');
      expect(input.style.width).toBe('33.25%');
      expect(input.style.height).toBe('4%');
    });
  });

  describe('the droppable look', () => {
    it('carries the aimed class only when aimed is true', () => {
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={true}
          pageWidthPoints={600}
          label="First name"
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      expect(input.classList.contains(styles.slot)).toBe(true);
      expect(input.classList.contains(styles.aimed)).toBe(true);
    });

    it('leaves off the aimed class at rest', () => {
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      expect(input.classList.contains(styles.slot)).toBe(true);
      expect(input.classList.contains(styles.aimed)).toBe(false);
    });
  });

  describe('typography', () => {
    it('resolves fontFamily and fontSize the way TextNode.tsx does, through fonts.js', () => {
      const slot = fillSlot({ placement: { box: { left: 0, top: 0, width: 40, height: 6 }, fontSize: 16, fontFamily: 'Arimo' } });
      // scale is 1: the mocked page wrapper is 600px wide, matching pageWidthPoints.
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      expect(input.style.fontFamily).toBe('Arimo');
      expect(input.style.fontSize).toBe('16px');
      expect(input.style.fontWeight).toBe('normal');
      expect(input.style.fontStyle).toBe('normal');
    });
  });
});
