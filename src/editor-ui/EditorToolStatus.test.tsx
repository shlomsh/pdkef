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
});
