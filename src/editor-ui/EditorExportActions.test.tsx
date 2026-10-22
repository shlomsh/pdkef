import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import EditorExportActions, { type EditorExportActionsProps } from './EditorExportActions.tsx';
import styles from './SignToolbar.module.css';
import workspaceStyles from './Workspace.module.css';

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

  // Shlomi 2026-10-20: the icons and labels never change with readiness, so
  // the pair's width never moves, and both variants draw the same glyphs.
  (['toolbar', 'completion'] as const).forEach((variant) => {
    it(`${variant}: Share draws the same icon whether or not a file is ready, and Download has one`, () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      const svgFor = (label: string, shareReady: boolean) => {
        act(() => {
          render(
            <EditorExportActions variant={variant} canShare shareReady={shareReady} disabled={false}
              onDownload={() => {}} onPrepareShare={() => {}} onShare={() => {}} />,
            container,
          );
        });
        const button = required(
          Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label),
          `${label} button`,
        );
        return button.querySelector('svg')?.outerHTML ?? null;
      };
      const pending = svgFor('Share', false);
      expect(pending).not.toBeNull();
      expect(svgFor('Share', true)).toBe(pending);
      expect(svgFor('Download', false)).not.toBeNull();
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
  it('toolbar: confirmed swaps Download for the Saved label and a check, same plain button', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const mount = (confirmed: boolean) => act(() => {
      render(
        <div className={styles.toolbar}>
          <EditorExportActions variant="toolbar" canShare={false} shareReady={false} disabled={false} confirmed={confirmed}
            onDownload={() => {}} onPrepareShare={() => {}} onShare={() => {}} />
        </div>,
        container,
      );
    });
    mount(false);
    const before = required(container.querySelector('button'), 'button');
    expect(before.querySelector('[aria-hidden="true"]:not(svg)')?.textContent).toContain('Saved');
    mount(true);
    const button = required(container.querySelector('button'), 'button');
    expect(button.parentElement).toBe(container.querySelector(`.${styles.toolbar}`));
    const visible = Array.from(button.querySelectorAll('[aria-hidden="true"]')).filter((el) => el.textContent?.trim());
    expect(visible.map((el) => el.textContent?.trim())).toEqual(['Download']);
    expect(button.textContent).toContain('Saved');
    expect(button.getAttribute('aria-label')).toBe('Download');
    expect(button.classList.contains(styles.download)).toBe(true);
  });

  it('toolbar: confirmedLabel overrides Saved; unconfirmed renders no hidden twin', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <EditorExportActions variant="toolbar" canShare={false} shareReady={false} disabled={false} confirmed confirmedLabel="Guardado"
          onDownload={() => {}} onPrepareShare={() => {}} onShare={() => {}} />,
        container,
      );
    });
    expect(container.querySelector('button')?.textContent).toContain('Guardado');
    act(() => {
      render(
        <EditorExportActions variant="toolbar" canShare={false} shareReady={false} disabled={false}
          onDownload={() => {}} onPrepareShare={() => {}} onShare={() => {}} />,
        container,
      );
    });
    expect(container.querySelector('button [aria-hidden="true"]:not(svg)')).toBeNull();
  });

  it('completion: renders a caller-supplied downloadLabel, falling back to Download', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const labelOf = (downloadLabel?: string) => {
      act(() => {
        render(
          <EditorExportActions variant="completion" canShare={false} shareReady={false} disabled={false} downloadLabel={downloadLabel}
            onDownload={() => {}} onPrepareShare={() => {}} onShare={() => {}} />,
          container,
        );
      });
      return container.querySelector('button')?.textContent?.trim();
    };
    expect(labelOf()).toBe('Download');
    expect(labelOf('Save a copy')).toBe('Save a copy');
  });

  it('completion: takes the caller locale for both labels and the row direction', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <EditorExportActions variant="completion" canShare shareReady={false} disabled={false}
          shareLabel="שיתוף" downloadLabel="הורדה" dir="rtl" lang="he"
          onDownload={() => {}} onPrepareShare={() => {}} onShare={() => {}} />,
        container,
      );
    });
    const row = container.firstElementChild as HTMLElement;
    expect(row.getAttribute('dir')).toBe('rtl');
    expect(row.getAttribute('lang')).toBe('he');
    expect([...container.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['הורדה', 'שיתוף']);
  });
});
