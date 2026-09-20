import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToolShell, { ToolShellContext } from './ToolShell.tsx';
import styles from './ToolShell.module.css';

/* BasePdfTool.test.tsx covers the default shell (thumbnail, actions). This is
   the editor variant Sign and Redact mount themselves. */
describe('ToolShell editor variant', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const mount = (editor: boolean) => {
    const file = new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' });
    act(() => {
      render(
        <ToolShellContext.Provider
          value={{
            requestReplace: vi.fn(),
            requestClear: vi.fn(),
            fileLabel: 'form.pdf',
            fileMeta: '1 page · 12 KB',
            file,
            draftSaveState: 'saved',
          }}
        >
          <ToolShell editor={editor} status={<span data-status>hint</span>}>
            <button type="button">tool</button>
          </ToolShell>
        </ToolShellContext.Provider>,
        container,
      );
    });
  };

  // The document is right under the card at full size; the 34px page-1 render
  // was what forced the phone identity into two lines, and cost a pdf.js
  // render Sign and Redact were only doing for it.
  it('renders no thumbnail, while the default shell still does', () => {
    mount(true);
    expect(container.querySelector(`.${styles.icon}`)).toBeNull();
    expect(container.querySelector(`.${styles.name}`)!.textContent).toBe('form.pdf');
    expect(container.querySelector(`.${styles['meta-text']}`)!.textContent).toBe('1 page · 12 KB');
    expect(container.querySelector(`.${styles.saved}`)).not.toBeNull();
    expect(container.querySelector('[data-status]')).not.toBeNull();

    mount(false);
    expect(container.querySelector(`.${styles.icon}`)).not.toBeNull();
  });

  // SIGN-06 follow-up: the unpersisted-storage line is a quiet line, never a
  // banner or a modal (docs/ux-design-guidelines.md §11) - same chip family
  // as 'saved'/'pending', not the danger styling 'error'/'conflict' use, and
  // it must never carry role="alert" the way those do.
  it('renders the unpersisted-storage line with the pending (quiet) styling, not the danger styling', () => {
    const file = new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' });
    act(() => {
      render(
        <ToolShellContext.Provider
          value={{
            requestReplace: vi.fn(),
            requestClear: vi.fn(),
            fileLabel: 'form.pdf',
            file,
            draftSaveState: 'unpersisted',
          }}
        >
          <ToolShell />
        </ToolShellContext.Provider>,
        container,
      );
    });

    const chip = container.querySelector(`.${styles.pending}`);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('Draft saved, but this browser might not keep it - download to be safe');
    expect(container.querySelector(`.${styles.error}`)).toBeNull();
    expect(chip!.getAttribute('role')).toBeNull();
  });
});
