import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NeedsUnlock from './NeedsUnlock.tsx';
import { installToolHarness, type ToolHarness } from '../test/harness/toolHarness.ts';
import { ToolShellContext } from './ToolShell.tsx';
// Asserts the .unlock class: the primary action is styled as the primary action.

describe('NeedsUnlock', () => {
  let container: HTMLDivElement;

  let harness: ToolHarness;

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    act(() => render(null, container));
    container.remove();
    await harness.settle();
    harness.restore();
  });

  const mount = (kind: 'needs-password' | 'owner-restricted' = 'needs-password') => {
    const file = new File(['%PDF-1.4'], 'Quarterly report.pdf', { type: 'application/pdf' });
    act(() => {
      render(
        <ToolShellContext.Provider value={{ requestReplace: vi.fn(), requestClear: vi.fn(), file, multiple: false } as never}>
          <NeedsUnlock kind={kind} file={file} bytes={new ArrayBuffer(8)} from="redact" toolName="Redact" verb="redact" />
        </ToolShellContext.Provider>,
        container,
      );
    });
  };

  it('leads with "Unlock it" as the only button in the action row, Replace the quiet line after it', () => {
    mount();
    const unlockButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Unlock it')!;
    const actions = unlockButton.parentElement!;
    const buttons = [...actions.querySelectorAll('button')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].hasAttribute('data-unlock')).toBe(true);
    expect(container.querySelector('[data-replace-line]')).not.toBeNull();
    expect(actions.querySelector('[data-replace-line]')).toBeNull();
  });

  it('keeps the end of a long file name in the chip', () => {
    const name = 'a-very-long-quarterly-financial-statement-and-supporting-schedules-final-2026.pdf';
    const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
    act(() => {
      render(
        <ToolShellContext.Provider value={{ requestReplace: vi.fn(), requestClear: vi.fn(), file, multiple: false } as never}>
          <NeedsUnlock kind="needs-password" file={file} bytes={new ArrayBuffer(8)} from="redact" toolName="Redact" verb="redact" />
        </ToolShellContext.Provider>,
        container,
      );
    });
    const chip = container.querySelector('[data-file-chip]')!;
    expect(chip.querySelector(`[title="${name}"]`)).not.toBeNull();
    expect(chip.textContent!.endsWith('-2026.pdf')).toBe(true);
  });

  it('names the file it is about, under a heading, with a decorative lock', () => {
    mount();
    expect(container.querySelector('h2')!.textContent).toBe('This PDF has a password');
    expect(container.querySelector('h2')!.nextElementSibling!.hasAttribute('data-file-chip')).toBe(true);
    expect(container.querySelector('[data-file-chip]')!.textContent).toContain('Quarterly report.pdf');
    expect(container.querySelector('[data-needs-unlock] > [aria-hidden="true"]')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('says why a file that opens without a password still needs Unlock', () => {
    mount('owner-restricted');
    expect(container.querySelector('h2')!.textContent).toBe('This PDF is protected');
    expect(container.textContent).toContain("Redact can't change it");
  });

  it('renders no Replace button with replace={false}', () => {
    const file = new File(['%PDF-1.4'], 'locked.pdf', { type: 'application/pdf' });
    act(() => {
      render(
        <ToolShellContext.Provider value={{ requestReplace: vi.fn(), requestClear: vi.fn(), file, multiple: false } as never}>
          <NeedsUnlock kind="needs-password" file={file} bytes={new ArrayBuffer(8)} from="compress" toolName="Compress" verb="compress" replace={false} />
        </ToolShellContext.Provider>,
        container,
      );
    });
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain('Unlock it');
    expect(container.querySelector('[data-replace-line]')).toBeNull();
  });

  it('shows the Hebrew title with the Hebrew messages', () => {
    const file = new File(['%PDF-1.4'], 'locked.pdf', { type: 'application/pdf' });
    const messages = { title: 'ה-PDF הזה מוגן בסיסמה', body: 'גוף בעברית', unlockIt: 'פתחו אותו', handoffFailed: 'לא הצלחנו' };
    act(() => {
      render(
        <ToolShellContext.Provider value={{ requestReplace: vi.fn(), requestClear: vi.fn(), file, multiple: false } as never}>
          <NeedsUnlock kind="needs-password" file={file} bytes={new ArrayBuffer(8)} from="compress" toolName="Compress" verb="compress" messages={messages} />
        </ToolShellContext.Provider>,
        container,
      );
    });
    expect(container.querySelector('h2')!.textContent).toBe(messages.title);
    expect(container.textContent).toContain(messages.body);
    expect(container.querySelector('[data-unlock]')!.textContent).toBe(messages.unlockIt);
    expect(container.textContent).not.toContain('This PDF has a password');
    expect(container.textContent).not.toContain('Unlock it');
  });

  it('"Unlock it" parks the file for Unlock', async () => {
    mount();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-unlock]')!.click();
    });
    await harness.settle();
    const parked = await harness.takeHandoff('unlock');
    expect(parked).toEqual(expect.objectContaining({ from: 'redact', fileName: 'Quarterly report.pdf' }));
  });
});
