import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NeedsUnlock from './NeedsUnlock.tsx';
import { ToolShellContext } from './ToolShell.tsx';
import shellStyles from './ToolShell.module.css';
import styles from './NeedsUnlock.module.css';

describe('NeedsUnlock', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
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

  it('leads with "Unlock it" as the primary button, with Replace as the quiet chip beside it', () => {
    mount();
    const buttons = [...container.querySelectorAll('button')];
    const unlock = buttons.find((b) => b.textContent?.includes('Unlock it'))!;
    const replace = buttons.find((b) => b !== unlock)!;
    expect(unlock.classList.contains(styles.unlock)).toBe(true);
    expect(unlock.classList.contains(shellStyles.action)).toBe(false);
    expect(replace.classList.contains(shellStyles.action)).toBe(true);
  });

  it('names the file it is about, under a heading, with a decorative lock', () => {
    mount();
    expect(container.querySelector('h2')!.textContent).toBe('This PDF has a password');
    expect(container.querySelector(`.${styles.file}`)!.textContent).toContain('Quarterly report.pdf');
    expect(container.querySelector(`.${styles.art}`)!.getAttribute('aria-hidden')).toBe('true');
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
  });
});
