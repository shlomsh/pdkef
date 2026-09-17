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
});
