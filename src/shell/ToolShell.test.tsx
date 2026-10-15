import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToolShell, { ToolShellContext } from './ToolShell.tsx';
import styles from './ToolShell.module.css';
import { englishShellMessages } from '../i18n/toolMessages';

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
    // MEM-11: the retention hint rides along too (unpersisted is not error/conflict).
    expect(chip!.textContent).toBe(
      'Draft saved, but this browser might not keep it - download to be safe'
      + englishShellMessages.draftRetentionInfo,
    );
    expect(container.querySelector(`.${styles.error}`)).toBeNull();
    expect(chip!.getAttribute('role')).toBeNull();
  });

  // MEM-11: the retention tooltip rides along with a non-alarming draft
  // status ('saved' here) but never with the danger states.
  it('shows the retention tooltip next to a saved draft chip', () => {
    const file = new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' });
    act(() => {
      render(
        <ToolShellContext.Provider
          value={{
            requestReplace: vi.fn(),
            requestClear: vi.fn(),
            fileLabel: 'form.pdf',
            file,
            draftSaveState: 'saved',
          }}
        >
          <ToolShell />
        </ToolShellContext.Provider>,
        container,
      );
    });

    const trigger = container.querySelector('[tabindex="0"][aria-describedby]');
    expect(trigger).not.toBeNull();
    const tipId = trigger!.getAttribute('aria-describedby')!;
    const tooltip = container.querySelector(`#${tipId}`);
    expect(tooltip).not.toBeNull();
    expect(tooltip!.getAttribute('role')).toBe('tooltip');
    expect(tooltip!.textContent).toBe(englishShellMessages.draftRetentionInfo);
  });

  it('does not show the retention tooltip for an error draft state', () => {
    const file = new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' });
    act(() => {
      render(
        <ToolShellContext.Provider
          value={{
            requestReplace: vi.fn(),
            requestClear: vi.fn(),
            fileLabel: 'form.pdf',
            file,
            draftSaveState: 'error',
          }}
        >
          <ToolShell />
        </ToolShellContext.Provider>,
        container,
      );
    });

    expect(container.querySelector('[tabindex="0"][aria-describedby]')).toBeNull();
  });
});

/* The loaded-file strip's two tool slots (docs/ux-design-guidelines.md §18). */
describe('ToolShell strip slots', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const mount = (editor: boolean, extra: Record<string, unknown>) => {
    act(() => {
      render(
        <ToolShellContext.Provider
          value={{ requestReplace: vi.fn(), requestClear: vi.fn(), fileLabel: 'a.pdf', fileMeta: '2 pages · 5 KB', ...extra }}
        >
          <ToolShell editor={editor} />
        </ToolShellContext.Provider>,
        container,
      );
    });
  };

  it('renders a note from context inside the strip, and nothing when absent', () => {
    mount(false, { note: <span data-note-content>Smaller is possible</span> });
    const shell = container.querySelector('[data-tool-shell]')!;
    expect(shell.querySelector(`.${styles.note} [data-note-content]`)).not.toBeNull();

    mount(false, {});
    expect(container.querySelector(`.${styles.note}`)).toBeNull();
  });

  it('lets a Hebrew file name take its own direction, so ".pdf" stays at its end', () => {
    for (const editor of [false, true]) {
      mount(editor, { fileLabel: 'דוח רבעוני.pdf' });
      expect(container.querySelector(`.${styles.name}`)!.getAttribute('dir')).toBe('auto');
    }
  });

  it('renders metaExtra after the file meta, in the meta line', () => {
    mount(false, { metaExtra: <span data-extra>843 KB</span> });
    const meta = container.querySelector(`.${styles.meta}`)!;
    const text = meta.querySelector(`.${styles['meta-text']}`)!;
    const extra = meta.querySelector('[data-extra]')!;
    expect(extra).not.toBeNull();
    expect(text.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves the editor variant without either slot', () => {
    mount(true, { note: <span>n</span>, metaExtra: <span data-extra>x</span> });
    expect(container.querySelector(`.${styles.note}`)).toBeNull();
    expect(container.querySelector('[data-extra]')).toBeNull();
  });
});
