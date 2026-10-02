import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NeedsUnlock from './NeedsUnlock.tsx';
import { ToolShellContext } from './ToolShell.tsx';
import shellStyles from './ToolShell.module.css';

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

  it('draws "Unlock it" with the same chip as Replace, at the same icon size', () => {
    const file = new File(['%PDF-1.4'], 'locked.pdf', { type: 'application/pdf' });
    act(() => {
      render(
        <ToolShellContext.Provider value={{ requestReplace: vi.fn(), requestClear: vi.fn(), file, multiple: false } as never}>
          <NeedsUnlock kind="needs-password" file={file} bytes={new ArrayBuffer(8)} from="redact" toolName="Redact" verb="redact" />
        </ToolShellContext.Provider>,
        container,
      );
    });
    const buttons = [...container.querySelectorAll('button')];
    const unlock = buttons.find((b) => b.textContent?.includes('Unlock it'))!;
    const replace = buttons.find((b) => b !== unlock)!;
    expect(unlock.classList.contains(shellStyles.action)).toBe(true);
    expect(replace.classList.contains(shellStyles.action)).toBe(true);
    expect(unlock.querySelector('svg')!.getAttribute('width')).toBe('12');
    expect(replace.querySelector('svg')!.getAttribute('width')).toBe('12');
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
