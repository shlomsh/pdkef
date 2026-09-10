import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import EditorExportActions, { type EditorExportActionsProps } from './EditorExportActions.tsx';
import styles from './SignTool/SignToolbar.module.css';
import workspaceStyles from './SignTool/Workspace.module.css';

function required<T>(value: T | null | undefined, description: string): T {
  if (value == null) throw new Error(`Expected ${description}`);
  return value;
}

// Two profiles standing in for how Sign and Redact actually call this
// component, so "parity" here means something real: the same component,
// wired the way each tool wires it, has to keep the same guarantees for
// both - not just when given identical props by a test.
const PROFILES: Record<'sign' | 'redact', {
  makeProps: (overrides?: Partial<EditorExportActionsProps>) => EditorExportActionsProps;
}> = {
  sign: {
    makeProps: (overrides = {}) => ({
      variant: 'completion',
      canShare: true,
      shareReady: false,
      disabled: false,
      onDownload: vi.fn(),
      onPrepareShare: vi.fn(),
      onShare: vi.fn(),
      describedBy: 'sign-export-readiness',
      ...overrides,
    }),
  },
  redact: {
    makeProps: (overrides = {}) => ({
      variant: 'completion',
      canShare: true,
      shareReady: false,
      disabled: false,
      onDownload: vi.fn(),
      onPrepareShare: vi.fn(),
      onShare: vi.fn(),
      downloadTitle: 'Apply redactions and download',
      shareTitle: 'Apply redactions and prepare the PDF for sharing',
      ...overrides,
    }),
  },
};

describe('EditorExportActions parity contract', () => {
  let container = document.createElement('div');

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.body.innerHTML = '';
  });

  (Object.keys(PROFILES) as Array<keyof typeof PROFILES>).forEach((tool) => {
    describe(`${tool} profile`, () => {
      it('exposes a completion action row', () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
          render(<EditorExportActions {...PROFILES[tool].makeProps()} />, container);
        });

        const row = required(container.querySelector(`.${workspaceStyles['export-actions']}`), 'export-actions row');
        expect(row).not.toBeNull();
      });

      it('always exposes Download, even when native Share is unavailable', () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
          render(<EditorExportActions {...PROFILES[tool].makeProps({ canShare: false })} />, container);
        });

        const downloadButton = required(
          Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Download'),
          'Download button',
        );
        expect(downloadButton).not.toBeNull();
        expect(container.querySelectorAll('button')).toHaveLength(1);
      });

      it('exposes Share only when native file sharing is supported', () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
          render(<EditorExportActions {...PROFILES[tool].makeProps({ canShare: true })} />, container);
        });

        const shareButton = required(
          Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Share'),
          'Share button',
        );
        expect(shareButton).not.toBeNull();
      });

      it('disables every action while exporting or when there is nothing to export', () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
          render(<EditorExportActions {...PROFILES[tool].makeProps({ disabled: true })} />, container);
        });

        const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
        expect(buttons.length).toBeGreaterThan(0);
        buttons.forEach((button) => expect(button.disabled).toBe(true));
      });

      it('routes Download and the two Share states to their own callbacks', () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const onDownload = vi.fn();
        const onPrepareShare = vi.fn();
        const onShare = vi.fn();

        act(() => {
          render(<EditorExportActions {...PROFILES[tool].makeProps({ onDownload, onPrepareShare, onShare, shareReady: false })} />, container);
        });

        const downloadButton = required(
          Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Download'),
          'Download button',
        );
        const shareButton = required(
          Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Share'),
          'Share button',
        );

        act(() => { downloadButton.click(); });
        expect(onDownload).toHaveBeenCalledOnce();

        act(() => { shareButton.click(); });
        expect(onPrepareShare).toHaveBeenCalledOnce();
        expect(onShare).not.toHaveBeenCalled();

        act(() => {
          render(<EditorExportActions {...PROFILES[tool].makeProps({ onDownload, onPrepareShare, onShare, shareReady: true })} />, container);
        });
        const readyShareButton = required(
          Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Share'),
          'ready Share button',
        );
        act(() => { readyShareButton.click(); });
        expect(onShare).toHaveBeenCalledOnce();
        expect(onPrepareShare).toHaveBeenCalledOnce();
      });
    });
  });

  // The toolbar variant has a structural contract of its own (SignToolbar's
  // "every visible control is a direct child of .toolbar" test): this
  // component must render Share/Download unwrapped, as siblings, or the
  // module's `:has(> :nth-child(N of :not(.desktop-download)))` responsive
  // math silently mis-measures every wrap threshold it drives.
  it('renders the toolbar variant as unwrapped siblings, matching the sticky-toolbar DOM contract', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <div className={styles.toolbar}>
          <EditorExportActions
            variant="toolbar"
            canShare
            shareReady={false}
            disabled={false}
            onDownload={() => {}}
            onPrepareShare={() => {}}
            onShare={() => {}}
          />
        </div>,
        container,
      );
    });

    const toolbar = required(container.querySelector(`.${styles.toolbar}`), 'toolbar');
    const directButtons = Array.from(toolbar.children).filter((el) => el.tagName === 'BUTTON');
    expect(directButtons).toHaveLength(2);

    const downloadButton = required(
      directButtons.find((b) => b.textContent?.trim() === 'Download'),
      'Download button',
    ) as HTMLButtonElement;
    expect(downloadButton.classList.contains(styles['desktop-download'])).toBe(true);
  });

  it('omits the toolbar Download\'s mobile-hiding class when Share is unavailable', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <div className={styles.toolbar}>
          <EditorExportActions
            variant="toolbar"
            canShare={false}
            shareReady={false}
            disabled={false}
            onDownload={() => {}}
            onPrepareShare={() => {}}
            onShare={() => {}}
          />
        </div>,
        container,
      );
    });

    const downloadButton = required(
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Download'),
      'Download button',
    );
    expect(downloadButton.classList.contains(styles['desktop-download'])).toBe(false);
  });
});
