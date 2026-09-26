import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FieldSlot from './FieldSlot.tsx';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import elementStyles from '../../../editor-ui/EditorElement.module.css';
import styles from './fill.module.css';
import { textElementLayout } from '../../../lib/signHelpers.js';
import { combLayout } from '../../../editor/text/comb.js';
import { FILL_INPUT_ATTR, FILL_KEY_ATTR } from './fillTypes.ts';
import type { FillSlot } from './fillTypes.ts';
import type { TextElement } from '../../../editor/model/editorModel.ts';
import { slotFrame } from './slotFrame.ts';

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

/**
 * The default test double for `elementOf`: a plain (non-comb) text element
 * with no explicit direction, so `getEffectiveTextDirection` falls through
 * to detecting the typed text and then to 'ltr' - matching what a fresh,
 * undirected document gives a free slot in production (elementForSlot).
 */
function textElementOf(text: string, overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'fill-slot-preview',
    type: 'text',
    pageIndex: 0,
    // Matches fillSlot()'s own default placement (left 12.5, top 30,
    // Arimo 12pt), so a test that doesn't override either one still gets a
    // slot that reads as coming from the same spot it would in production
    // (elementForSlot builds the element from the very same placement).
    left: 12.5,
    top: 30,
    fontFamily: 'Arimo',
    fontSize: 12,
    text,
    color: '#1463ff',
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
        elementOf={textElementOf}
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
    // Not "auto": the slot's direction comes from getEffectiveTextDirection
    // on the element it would become (elementOf), same as every text box.
    expect(input.getAttribute('dir')).toBe('ltr');
    expect(input.getAttribute('aria-label')).toBe('First name');
    expect(input.getAttribute('autocomplete')).toBe('off');
    // autocorrect is the boolean `false`, not the string "off" (see the
    // WebKit boolean-IDL-property test below): jsdom has no `autocorrect`
    // DOM property, so Preact falls back to the attribute path, and a
    // boolean `false` value there removes the attribute rather than
    // writing it - there is nothing named "autocorrect" for jsdom to show.
    expect(input.hasAttribute('autocorrect')).toBe(false);
  });

  it('sets the real boolean false on WebKit, where autocorrect is a boolean IDL property, not the truthy string "off"', () => {
    // WebKit exposes HTMLElement.autocorrect as a boolean IDL property
    // reflecting the "on"/"off" content attribute. jsdom has no such
    // property, so this stub reproduces it for the duration of the test:
    // the bug was that Preact writes a *string* prop as a DOM property
    // whenever `name in dom`, and ToBoolean("off") is true, turning
    // autocorrect ON. Fails before the fix (autocorrect === true from the
    // old `autocorrect="off"` string), passes after (the real `false`).
    Object.defineProperty(HTMLInputElement.prototype, 'autocorrect', {
      configurable: true,
      get() {
        return this.getAttribute('autocorrect') !== 'off';
      },
      set(v) {
        this.setAttribute('autocorrect', v ? 'on' : 'off');
      },
    });
    try {
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          elementOf={textElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      expect(input.autocorrect).toBe(false);
    } finally {
      delete (HTMLInputElement.prototype as { autocorrect?: unknown }).autocorrect;
    }
  });

  it('sets "done" as the enterkeyhint on the last field, per the enterKeyHint prop', () => {
    host = mount(
      <FieldSlot
        slot={fillSlot()}
        enterKeyHint="done"
        aimed={false}
        pageWidthPoints={600}
        label="Signature date"
        elementOf={textElementOf}
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
          elementOf={textElementOf}
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
          elementOf={textElementOf}
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
          elementOf={textElementOf}
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
          elementOf={textElementOf}
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
          elementOf={textElementOf}
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
          elementOf={textElementOf}
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
          elementOf={textElementOf}
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
          elementOf={textElementOf}
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
          elementOf={textElementOf}
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
    it('places a free slot (no field) at elementOf(value)\'s own left/top, keeping the placement\'s span', () => {
      // A free slot's committed element has no width of its own (it only gets
      // one once it is measured on screen, which a bare <input> cannot do),
      // so the span still comes from the placement - but the position comes
      // from the element, same as every other geometry FieldSlot reads.
      const slot = fillSlot({ placement: { box: { left: 8, top: 22.5, width: 33.25, height: 4 }, fontSize: 12, fontFamily: 'Arimo' } });
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          elementOf={(text) => textElementOf(text, { left: 8, top: 22.5 })}
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

    it('carries no inline height for a field slot, leaving the box height to fill.module.css\'s .slot rule', () => {
      // jsdom cannot compute the calc() the class rule uses, but an inline
      // height would beat it regardless (textElementLayout's box has
      // height: 'auto' for a field slot) - this is what iOS's ~3x pill bug
      // came from, so the regression is an inline style existing at all.
      const slot = fillSlot({ field: {} as FillSlot['field'], placement: { box: { left: 0, top: 0, width: 1, height: 1 }, fontSize: 12, fontFamily: 'Arimo' } });
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="Employer"
          elementOf={(text) => textElementOf(text, { left: 15, top: 60, minWidth: 20 })}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      expect(input.style.height).toBe('');
    });
  });

  describe('geometry matches textElementLayout (not slot.placement)', () => {
    it('a comb field slot sits exactly where textElementLayout(elementOf(value)) says', () => {
      const slot = fillSlot({ field: {} as FillSlot['field'], placement: { box: { left: 0, top: 0, width: 1, height: 1 }, fontSize: 12, fontFamily: 'Arimo', combCells: 3 } });
      const combElementOf = (text: string) => textElementOf(text, { left: 30, top: 40, width: 25, combCells: 3 });
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="ID number"
          elementOf={combElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');
      const expected = textElementLayout(combElementOf(''), 1) as { box: Record<string, string>; font: Record<string, string | number> };

      expect(input.style.left).toBe(expected.box.left);
      expect(input.style.top).toBe(expected.box.top);
      expect(input.style.width).toBe(expected.box.width);
      expect(input.style.fontSize).toBe(`${expected.font.fontSize}px`);
      expect(input.style.fontFamily).toBe(expected.font.fontFamily);
    });

    it('a plain (non-comb) field slot on a detected cell sits exactly where textElementLayout(elementOf(value)) says', () => {
      const slot = fillSlot({ field: {} as FillSlot['field'], placement: { box: { left: 0, top: 0, width: 1, height: 1 }, fontSize: 12, fontFamily: 'Arimo' } });
      const cellElementOf = (text: string) => textElementOf(text, { left: 15, top: 60, minWidth: 20 });
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="Employer"
          elementOf={cellElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');
      const expected = textElementLayout(cellElementOf(''), 1) as { box: Record<string, string>; font: Record<string, string | number> };

      expect(input.style.left).toBe(expected.box.left);
      expect(input.style.top).toBe(expected.box.top);
      expect(input.style.minWidth).toBe(expected.box.minWidth);
      // Not a tautological 'auto' === 'auto': textElementLayout gives a
      // detected cell width: 'auto' plus minWidth (the div shrink-wraps to
      // it), but an <input> cannot shrink-wrap, so FieldSlot pins width to
      // the cell itself - the same value as minWidth.
      expect(expected.box.width).toBe('auto');
      expect(input.style.width).toBe(expected.box.minWidth);
      expect(input.style.fontSize).toBe(`${expected.font.fontSize}px`);
      expect(input.style.fontFamily).toBe(expected.font.fontFamily);
    });
  });

  describe('the frame a field slot draws at rest (slotFrame.ts)', () => {
    it('takes its inline top/height from the frame, and its padding from slotFrame, for a field taller than the line', () => {
      // mount()'s page wrapper is 600x800 (editor.md's "mock a realistic
      // page rect"), so 1% of the page height is 8px. This field (30%-36%,
      // 48px) is comfortably taller than one 12pt line, so the frame equals
      // the field itself - the regression this ticket fixes (a frame short
      // of the printed field).
      const field: FillSlot['field'] = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 30, width: 40, height: 6 } };
      const slot = fillSlot({
        field,
        placement: { box: { left: 10, top: 30, width: 40, height: 6 }, fontSize: 12, fontFamily: 'Arimo' },
      });
      const cellElementOf = (text: string) => textElementOf(text, { left: 10, top: 31, minWidth: 40 });
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="Employer"
          elementOf={cellElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');
      const layout = textElementLayout(cellElementOf(''), 1) as { font: { fontSize: number; paddingEm: number } };
      const expectedFrame = slotFrame({
        field: field.region,
        element: { top: 31 },
        fontSizePx: layout.font.fontSize,
        padEm: layout.font.paddingEm,
        pageHeightPx: 800,
      });

      // The field dominates: the frame is the field's own top/height.
      expect(expectedFrame.top).toBeCloseTo(30, 6);
      expect(expectedFrame.height).toBeCloseTo(6, 6);
      expect(input.style.top).toBe(`${expectedFrame.top}%`);
      expect(input.style.height).toBe(`${expectedFrame.height}%`);
      expect(input.style.paddingTop).toBe(`${expectedFrame.paddingTopPx}px`);
      expect(input.style.paddingBottom).toBe(`${expectedFrame.paddingBottomPx}px`);
    });

    it('grows the frame past a short field to cover a taller text line, still with slotFrame\'s own padding', () => {
      // This field (30%-30.5%, 4px) is far shorter than one 12pt line, so
      // the frame has to grow to the element's own padded box instead of
      // clipping the frame to the printed field.
      const field: FillSlot['field'] = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 30, width: 40, height: 0.5 } };
      const slot = fillSlot({
        field,
        placement: { box: { left: 10, top: 30, width: 40, height: 0.5 }, fontSize: 12, fontFamily: 'Arimo' },
      });
      const cellElementOf = (text: string) => textElementOf(text, { left: 10, top: 30, minWidth: 40 });
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="Employer"
          elementOf={cellElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');
      const layout = textElementLayout(cellElementOf(''), 1) as { font: { fontSize: number; paddingEm: number } };
      const expectedFrame = slotFrame({
        field: field.region,
        element: { top: 30 },
        fontSizePx: layout.font.fontSize,
        padEm: layout.font.paddingEm,
        pageHeightPx: 800,
      });

      // The frame is taller than the field it was clipped to before this
      // fix (the reported regression), and its top/bottom padding come out
      // to the plain text padding since the element's own box now decides
      // both edges.
      expect(expectedFrame.height).toBeGreaterThan(0.5);
      expect(input.style.top).toBe(`${expectedFrame.top}%`);
      expect(input.style.height).toBe(`${expectedFrame.height}%`);
      expect(input.style.paddingTop).toBe(`${expectedFrame.paddingTopPx}px`);
      expect(input.style.paddingBottom).toBe(`${expectedFrame.paddingBottomPx}px`);
    });

    it('leaves a free slot (no field) on its own CSS padding, with no inline padding at all', () => {
      const slot = fillSlot();
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          elementOf={textElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      expect(input.style.paddingTop).toBe('');
      expect(input.style.paddingBottom).toBe('');
    });

    it('keeps the comb overlay on the element\'s own box, unaffected by the frame', () => {
      // A tall comb field (5%-25%) whose element sits near its top: the
      // input's own frame has to cover the whole field, but the overlay
      // that draws the comb digits stays pinned to the element's own line.
      const field: FillSlot['field'] = { kind: 'comb', region: { pageIndex: 0, left: 10, top: 5, width: 40, height: 20, cells: 3 } };
      const slot = fillSlot({
        field,
        placement: { box: { left: 10, top: 5, width: 40, height: 20 }, fontSize: 12, fontFamily: 'Arimo', combCells: 3 },
      });
      const combElementOf = (text: string) => textElementOf(text, { left: 10, top: 6, width: 40, combCells: 3 });
      host = mount(
        <FieldSlot
          slot={slot}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="ID number"
          elementOf={combElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const overlay = requireElement<HTMLDivElement>(host, `.${styles['comb-overlay']}`);
      const input = requireElement<HTMLInputElement>(host, 'input');
      const expectedElementBox = textElementLayout(combElementOf(''), 1) as { box: Record<string, string> };

      expect(overlay.style.top).toBe(expectedElementBox.box.top);
      expect(overlay.style.left).toBe(expectedElementBox.box.left);
      // The input's own frame covers the whole 20%-tall field, so its top
      // sits above the overlay's (the element's own, narrower) top.
      expect(input.style.top).not.toBe(overlay.style.top);
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
          elementOf={textElementOf}
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
          elementOf={textElementOf}
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
    it('resolves fontFamily and fontSize from elementOf(value), the way TextNode.tsx does, through fonts.js', () => {
      // scale is 1: the mocked page wrapper is 600px wide, matching pageWidthPoints.
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          elementOf={(text) => textElementOf(text, { fontSize: 16 })}
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

  describe('comb preview and direction (elementOf)', () => {
    it('draws three live cells for a comb slot with "123" typed, and hides the input text', () => {
      const combElementOf = (text: string) => textElementOf(text, { width: 40, combCells: 3 });
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="ID number"
          elementOf={combElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      act(() => {
        input.value = '123';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const cells = host.querySelectorAll(`.${elementStyles['text-comb-cell']}`);
      expect(cells.length).toBe(3);
      expect(Array.from(cells).map((cell) => cell.textContent)).toEqual(['1', '2', '3']);
      // The transparent text colour is the static .slot-comb class now, not
      // an inline style (styling.md: inline is for runtime geometry only).
      expect(input.classList.contains(styles['slot-comb'])).toBe(true);
    });

    it('draws each comb digit with the committed element\'s own geometry: its box, font, cells and display shell', () => {
      // Form 101's postal code: seven open teeth. The overlay's digits have to
      // land exactly where TextNode.tsx draws the committed element's, so
      // everything that places them comes from the committed element's own
      // sources: textElementLayout's box and font, combLayout's cells, and
      // TextNode's `.text-display[data-comb="on"]` shell for the line-height
      // (1.05, not the page's inherited 1.6, which put every digit 0.275em low).
      const combElementOf = (text: string) => textElementOf(text, { left: 4.82, top: 30.2, width: 13.3, combCells: 7, fontSize: 10 });
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="Postal code"
          elementOf={combElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');
      act(() => {
        input.value = '3785500';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const committed = combElementOf('3785500');
      // The mocked page wrapper is 600px wide against 600pt: scale 1.
      const layout = textElementLayout(committed, 1);
      const box = layout.box as Record<string, string>;
      const overlay = requireElement<HTMLDivElement>(host, `.${styles['comb-overlay']}`);
      expect(overlay.style.left).toBe(box.left);
      expect(overlay.style.top).toBe(box.top);
      expect(overlay.style.width).toBe(box.width);
      expect(overlay.style.fontSize).toBe(`${layout.font.fontSize}px`);
      expect(overlay.style.getPropertyValue('--text-pad-em')).toBe(`${layout.font.paddingEm}em`);

      const shell = overlay.firstElementChild as HTMLElement;
      expect(shell.classList.contains(elementStyles['text-display'])).toBe(true);
      expect(shell.getAttribute('data-comb')).toBe('on');
      expect(shell.querySelector('[data-text-part="comb"]')).not.toBeNull();

      const cells = Array.from(shell.querySelectorAll<HTMLElement>('[data-text-part="comb-cell"]'));
      const expected = combLayout(committed, layout.direction === 'rtl');
      expect(cells.map((cell) => cell.textContent)).toEqual(expected.map((cell) => cell.char));
      expect(cells.map((cell) => cell.style.left)).toEqual(expected.map((cell) => `${cell.centerFraction * 100}%`));
    });

    it('starts an RTL page\'s empty field slot dir="rtl", and flips to "ltr" on typed Latin letters', () => {
      const rtlElementOf = (text: string) => textElementOf(text, { textDirection: 'rtl' });
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          elementOf={rtlElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');
      expect(input.getAttribute('dir')).toBe('rtl');

      act(() => {
        input.value = 'Shlomi';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(input.getAttribute('dir')).toBe('ltr');
    });

    it('draws the caret at selectionStart while the comb slot is focused', () => {
      const combElementOf = (text: string) => textElementOf(text, { width: 40, combCells: 3 });
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="ID number"
          elementOf={combElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      act(() => {
        input.value = '12';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        // A real .focus() (not a dispatched event) is what jsdom's own
        // document.activeElement tracks, which syncCaret reads.
        input.focus();
        input.selectionStart = 1;
        input.dispatchEvent(new Event('select', { bubbles: true }));
      });

      const caret = requireElement<HTMLSpanElement>(host, `.${elementStyles['text-comb-caret']}`);
      // Boundary between cell 0 and cell 1 of 3, same math as the guide lines.
      expect(caret.style.left).toBe(`${(1.5 / 3) * 100}%`); // the centre of cell 1
      // The native caret is hidden by the static .slot-comb rule (caret-color:
      // transparent in fill.module.css), never an inline style.
      expect(input.style.caretColor).toBe('');
    });

    it('shows no caret once the comb slot blurs', () => {
      const combElementOf = (text: string) => textElementOf(text, { width: 40, combCells: 3 });
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="ID number"
          elementOf={combElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );
      const input = requireElement<HTMLInputElement>(host, 'input');

      act(() => {
        input.focus();
        input.selectionStart = 1;
      });
      expect(host.querySelector(`.${elementStyles['text-comb-caret']}`)).not.toBeNull();

      act(() => {
        input.blur();
      });
      expect(host.querySelector(`.${elementStyles['text-comb-caret']}`)).toBeNull();
    });

    it('renders no comb cells for a non-comb slot', () => {
      host = mount(
        <FieldSlot
          slot={fillSlot()}
          enterKeyHint="next"
          aimed={false}
          pageWidthPoints={600}
          label="First name"
          elementOf={textElementOf}
          onEnter={() => {}}
          onCommit={() => {}}
        />
      );

      expect(host.querySelectorAll(`.${elementStyles['text-comb-cell']}`).length).toBe(0);
      expect(host.querySelector(`.${elementStyles['text-comb']}`)).toBeNull();
      expect(requireElement<HTMLInputElement>(host, 'input').classList.contains(styles['slot-comb'])).toBe(false);
    });
  });
});
