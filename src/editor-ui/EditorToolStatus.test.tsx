import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorToolStatus from './EditorToolStatus.tsx';
import styles from './SignToolbar.module.css';

/* The per-tool behaviour of the status line (which sentence, what the switch
   does, what it announces) is covered where the copy lives, in
   SignToolbar.test.tsx and PdfRedactTool.test.tsx. This file owns the slot's
   own contract: what it tells the shell, and what stays in the DOM in each
   state so the row's height never depends on which state it is in. */
describe('EditorToolStatus', () => {
  let container: HTMLDivElement;
  const TOOLS = [
    { action: 'Click and drag on a page to draw a blackout box.', button: 'Blackout' },
    { action: 'Click a highlighted image or text run to delete it from the file.', button: 'Delete' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const mount = (props: Partial<Parameters<typeof EditorToolStatus>[0]> = {}) => {
    act(() => {
      render(
        <EditorToolStatus
          copy={null}
          locked={false}
          onToggleKeepOn={vi.fn()}
          idle="Tip: pick a tool to start."
          reserveCopies={TOOLS}
          {...props}
        />,
        container,
      );
    });
    return container.querySelector<HTMLElement>(`.${styles.help}`)!;
  };

  const rows = () => container.querySelectorAll(`.${styles['help-row']}`);
  const shown = () => container.querySelector<HTMLElement>(`.${styles['help-shown']}`)!;

  // The shell hides the filename behind this attribute on a phone, so it has
  // to mean exactly "something live is in the slot": not idle, and not only
  // an armed tool - the undo chip counts too.
  it('marks the slot live only while a tool is armed or something has taken it over', () => {
    expect(mount().hasAttribute('data-status-active')).toBe(false);
    expect(mount({ copy: TOOLS[0] }).hasAttribute('data-status-active')).toBe(true);
    expect(mount({ override: <span>Removed 1 box</span> }).hasAttribute('data-status-active')).toBe(true);
    expect(mount().hasAttribute('data-status-active')).toBe(false);
  });

  // Height comes from the stack, so the stack has to be the same set of rows
  // whatever is showing: the idle row plus one reservation per tool, and the
  // live row on top of them, never instead of them.
  it('keeps every reservation in the stack in every state', () => {
    mount();
    expect(rows()).toHaveLength(1 + TOOLS.length);
    expect(shown().classList.contains(styles['help-idle'])).toBe(true);

    mount({ copy: TOOLS[0] });
    expect(rows()).toHaveLength(2 + TOOLS.length);
    expect(shown().getAttribute('role')).toBe('status');
    expect(shown().textContent).toContain(TOOLS[0].action);

    mount({ override: <span data-chip>Removed 1 box</span> });
    expect(rows()).toHaveLength(2 + TOOLS.length);
    expect(shown().getAttribute('role')).toBe('status');
    expect(shown().querySelector('[data-chip]')).not.toBeNull();
    expect(container.querySelectorAll(`.${styles['help-spare']}`)).toHaveLength(1 + TOOLS.length);
  });

  // The override is an override: with one up, the armed row is not rendered
  // as a second live row under it (two role="status" rows would announce and
  // stack twice), and the reservations still cover the armed row's height.
  it('lets the override win over an armed tool without dropping its reservation', () => {
    mount({ copy: TOOLS[0], override: <span>Removed 1 box</span> });
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(0);
    const spares = [...container.querySelectorAll(`.${styles['help-spare']}`)].map((row) => row.textContent);
    expect(spares.some((text) => text!.includes(TOOLS[0].action))).toBe(true);
  });

  // Both labels are in the switch and CSS picks by width, so the accessible
  // name is settled by the stylesheet and never by a resize listener.
  it('renders the long and the short keep-on label in the switch', () => {
    mount({ copy: TOOLS[0], keepOnLabel: 'Keep {button} on', keepOnShort: 'Keep on' });
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle.querySelector(`.${styles['keep-long']}`)!.textContent).toBe('Keep Blackout on');
    expect(toggle.querySelector(`.${styles['keep-short']}`)!.textContent).toBe('Keep on');
  });

  // FORM-11: the detector's own line. The slot's contract, not the wording -
  // which sentence belongs to which state is SignToolbar.test.tsx's, where the
  // copy lives.
  describe('fieldSummary', () => {
    const summary = () => container.querySelector<HTMLElement>(`.${styles['help-fields']}`);
    const isShown = (row: HTMLElement) => row.classList.contains(styles['help-shown']);

    it('renders nothing for a toolbar with no detector at all - Redact is unaffected', () => {
      mount();
      expect(summary()).toBeNull();
      expect(rows()).toHaveLength(1 + TOOLS.length);
    });

    // The live region has to exist before its text does, or the arrival of
    // the answer is a node appearing from nowhere rather than a change a
    // screen reader announces.
    it('is already in the DOM, empty and announcing, while the walk is still running', () => {
      mount({ fieldSummary: { text: null, problem: false } });
      expect(summary()!.textContent).toBe('');
      expect(summary()!.getAttribute('role')).toBe('status');
      expect(isShown(summary()!)).toBe(false);
    });

    // The bug this fixes: everything the detector knew used to be visible
    // only while a tool was armed, and loading a PDF disarms every tool.
    it('takes the idle tip\'s turn at rest, rather than a place of its own', () => {
      const host = mount({ fieldSummary: { text: '7 form fields found', problem: false } });
      expect(summary()!.textContent).toBe('7 form fields found');
      expect(isShown(summary()!)).toBe(true);
      // One row visible in the cell, never two stacked on each other.
      expect(host.querySelectorAll(`.${styles['help-shown']}`)).toHaveLength(1);
      expect(isShown(host.querySelector<HTMLElement>(`.${styles['help-idle']}`)!)).toBe(false);
      // A row of the stack, so the cell's height already covers it.
      expect(rows()).toHaveLength(2 + TOOLS.length);
    });

    // The armed row carries the keep-on switch, which on a phone is the only
    // way out of a locked tool. Nothing here may take its turn.
    it('yields to an armed tool and to an override, leaving one row shown', () => {
      mount({ copy: TOOLS[0], fieldSummary: { text: '7 form fields found', problem: true } });
      expect(isShown(summary()!)).toBe(false);
      expect(shown().textContent).toContain(TOOLS[0].action);
      expect(container.querySelectorAll('[role="switch"]')).toHaveLength(1);

      mount({ override: <span>Removed 1 box</span>, fieldSummary: { text: 'Could not check', problem: true } });
      expect(isShown(summary()!)).toBe(false);
      expect(shown().textContent).toBe('Removed 1 box');
    });

    // A result and a failure are the same row; the phone's one shared cell is
    // what treats them differently (`.help-fields` in SignToolbar.module.css),
    // and `data-status-active` is how the shell is told which it has.
    it('marks the slot live for a failure it is showing, and never for a result', () => {
      expect(mount({ fieldSummary: { text: '7 form fields found', problem: false } }).hasAttribute('data-status-active')).toBe(false);
      expect(summary()!.classList.contains(styles['help-fields-problem'])).toBe(false);

      const host = mount({ fieldSummary: { text: 'Could not check this PDF', problem: true } });
      expect(host.hasAttribute('data-status-active')).toBe(true);
      expect(summary()!.classList.contains(styles['help-fields-problem'])).toBe(true);

      // Not while something else owns the cell: the attribute would then be
      // claiming a row the shell is not showing.
      expect(mount({ copy: TOOLS[0], fieldSummary: { text: 'Could not check this PDF', problem: true } })
        .hasAttribute('data-status-active')).toBe(true);
    });
  });

  // MOBI-06: Sign's Next/Previous across detected fields. A separate control
  // from the stack above - it is not one of the rows the "keeps every
  // reservation" test counts, so it must never appear in `rows()`.
  describe('fieldNav', () => {
    const fieldNav = { hasNext: true, hasPrevious: false, onNext: vi.fn(), onPrevious: vi.fn(), nextLabel: 'Next field', previousLabel: 'Previous field' };

    it('renders nothing when the caller passes none - Redact is unaffected', () => {
      const host = mount();
      expect(host.querySelector(`.${styles['field-nav']}`)).toBeNull();
    });

    it('is present and active even while idle, unlike the armed-row stack', () => {
      const host = mount({ fieldNav });
      expect(host.querySelector(`.${styles['field-nav']}`)).not.toBeNull();
      expect(host.hasAttribute('data-status-active')).toBe(true);
      // Not one of the stack's own rows.
      expect(rows()).toHaveLength(1 + TOOLS.length);
    });

    it("disables each button by its own hasNext/hasPrevious, independently of the other", () => {
      const host = mount({ fieldNav });
      const [previous, next] = host.querySelectorAll<HTMLButtonElement>(`.${styles['field-nav-button']}`);
      expect(previous.disabled).toBe(true);
      expect(next.disabled).toBe(false);
    });

    it('calls onNext/onPrevious and exposes the given labels for a11y', () => {
      const onNext = vi.fn();
      const onPrevious = vi.fn();
      const host = mount({ fieldNav: { ...fieldNav, hasPrevious: true, onNext, onPrevious } });
      const [previous, next] = host.querySelectorAll<HTMLButtonElement>(`.${styles['field-nav-button']}`);
      expect(previous.getAttribute('aria-label')).toBe('Previous field');
      expect(next.getAttribute('aria-label')).toBe('Next field');
      next.click();
      previous.click();
      expect(onNext).toHaveBeenCalledTimes(1);
      expect(onPrevious).toHaveBeenCalledTimes(1);
    });

    it('coexists with an armed tool and with the override, never replacing either', () => {
      expect(mount({ fieldNav, copy: TOOLS[0] }).querySelector(`.${styles['field-nav']}`)).not.toBeNull();
      expect(mount({ fieldNav, override: <span>Removed 1 box</span> }).querySelector(`.${styles['field-nav']}`)).not.toBeNull();
    });
  });
});
