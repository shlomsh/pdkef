import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MergeWorkspace from './MergeWorkspace.tsx';
import { useMergeTool, type PdfMergeToolProps } from '../hooks/useMergeTool.ts';
import { ToolShellContext } from '#shell/ToolShell.tsx';
import { hebrewMergeMessages } from '../messages.ts';
import { hebrewShellMessages } from '#shell/shellMessages.ts';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';
import { pagesPdf } from '../../../test/support/mergeFixtures.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import '../../../test/support/realPdfjs.ts';

type View = ReturnType<typeof useMergeTool>;

const twoPages = (name: string) => pagesPdf([100, 100], name);

describe('MergeWorkspace', () => {
  let container: HTMLElement;
  let harness: ToolHarness;
  let view: View;

  function Probe({ props, children }: { props?: PdfMergeToolProps; children: (current: View) => ComponentChildren }) {
    view = useMergeTool(props);
    return <>{children(view)}</>;
  }

  const requestReplace = vi.fn();
  const requestClear = vi.fn();
  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    requestReplace.mockClear();
    requestClear.mockClear();
  });
  afterEach(async () => {
    act(() => render(null, container));
    container.remove();
    // The hand-off intake's IndexedDB read must end while the DOM still exists.
    await harness.settle();
    harness.restore();
  });

  const read = () => waitUntil(() => view.workspace.entries.length > 0 && view.workspace.entries.every((entry) => entry.pageCount !== null || entry.error));
  const add = async (files: File[]) => {
    await act(async () => { view.base.onFilesAdded(files); });
    await waitUntil(() => view.workspace.entries.length >= files.length);
    await read();
  };
  const mount = async (files: File[], props?: PdfMergeToolProps) => {
    act(() => render(
      <ToolShellContext.Provider value={{ requestReplace, requestClear }}>
        <Probe props={props}>
          {({ workspace }) => <MergeWorkspace {...workspace} rating={null} />}
        </Probe>
      </ToolShellContext.Provider>,
      container,
    ));
    await add(files);
  };

  const buttonLabels = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim());
  const fileNames = () => Array.from(container.querySelectorAll('ul[aria-describedby="reorder-hint"] > li [data-file-name]')).map((el) => el.textContent);
  const box = () => container.querySelector('a[data-state]') as HTMLAnchorElement;

  it('lists one file with its page count and asks for one more instead of offering Download', async () => {
    await mount([await pagesPdf([100, 100, 100], 'one.pdf')]);
    expect(fileNames()).toEqual(['one.pdf']);
    expect(container.querySelector('[data-testid="file-pages"]')?.textContent).toBe('3');
    expect(box().getAttribute('data-state')).toBe('one-file');
    expect(box().textContent).toContain('Add one more file to merge');
    expect(box().hasAttribute('href')).toBe(false);
    expect(buttonLabels()).not.toContain('Compress');
    expect(buttonLabels()).not.toContain('Sign');
    expect(buttonLabels()).not.toContain('Options');
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelector('[data-count]')).toBeNull();
    const choose = Array.from(box().querySelectorAll('button')).find((b) => b.textContent === 'Choose files') as HTMLButtonElement;
    act(() => choose.click());
    expect(requestReplace).toHaveBeenCalledTimes(1);
  });

  it('removes the file whose chip remove button is pressed', async () => {
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    const remove = container.querySelectorAll<HTMLButtonElement>('[data-chip-remove]');
    expect(remove).toHaveLength(2);
    act(() => remove[1].click());
    expect(view.workspace.entries.map((entry) => entry.file.name)).toEqual(['a.pdf']);
  });

  it('brings back the hand-off row and the page-numbers row once a second file arrives', async () => {
    await mount([await twoPages('a.pdf')]);
    expect(container.querySelector('[data-count]')).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    await add([await twoPages('b.pdf')]);
    expect(container.querySelector('[data-count]')).not.toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(buttonLabels()).toContain('Compress');
    expect(buttonLabels()).toContain('Sign');
    expect(buttonLabels()).not.toContain('Options');
  });

  it('keeps Add page numbers in the completion row, once, and out of the compact toolbar', async () => {
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    expect(container.querySelectorAll('details')).toHaveLength(0);
    const controls = container.querySelector('[data-merge-file-controls]') as HTMLElement;
    const rows = container.querySelectorAll('input[type="checkbox"]');
    expect(rows).toHaveLength(1);
    expect(controls.querySelector('input[type="checkbox"]')).toBeNull();
    expect(rows[0].closest('[data-rail-pinned]')).not.toBeNull();
  });

  it('keeps the visible mobile controls outside the sortable chip list', async () => {
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    const chipRow = container.querySelector('[data-testid="chip-row"]') as HTMLElement;
    const controls = container.querySelector('[data-merge-file-controls]') as HTMLElement;
    expect(chipRow.contains(controls)).toBe(false);
    expect(chipRow.querySelector('select, input')).toBeNull();
  });

  it('gives Add files and Clear all files an icon each in the rail and the phone controls, and Clear all asks the shell', async () => {
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    const fileButtons = Array.from(container.querySelectorAll('button')).filter((b) => ['Add files', 'Clear all files'].includes(b.textContent?.trim() ?? ''));
    expect(fileButtons.map((b) => b.textContent?.trim())).toEqual(['Add files', 'Clear all files', 'Add files', 'Clear all files']);
    for (const button of fileButtons) expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    act(() => fileButtons[1].click());
    act(() => fileButtons[3].click());
    expect(requestClear).toHaveBeenCalledTimes(2);
    expect(fileNames()).toEqual(['a.pdf', 'b.pdf']);
    act(() => fileButtons[0].click());
    expect(requestReplace).toHaveBeenCalledTimes(1);
  });

  it('shows the restored-draft sentence in the document header, for phones', async () => {
    await mount([await twoPages('x.pdf'), await twoPages('y.pdf')]);
    act(() => view.workspace.dispatch({ type: 'DRAFT_RESTORED', addPageNumbers: false, outputName: null }));
    const headerChip = container.querySelector('[role="status"]:has(button)') as HTMLElement;
    expect(headerChip.textContent).toContain('Picked up where you left off');
    const startFresh = Array.from(headerChip.querySelectorAll('button')).find((b) => b.textContent === 'Start fresh') as HTMLButtonElement;
    act(() => startFresh.click());
    expect(requestClear).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-merge-restored-workspace]')).not.toBeNull();
  });

  it('says how many pages are still to render in the heading, then stops saying it', async () => {
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    const heading = () => container.querySelector('#page-grid-heading') as HTMLElement;
    expect(heading().textContent).toContain('4 pages');
    expect(heading().textContent).toContain('0 rendered');
    act(() => view.workspace.onRenderedCountChange(3));
    expect(heading().textContent).toContain('3 rendered');
    act(() => view.workspace.onRenderedCountChange(4));
    expect(heading().textContent).not.toContain('rendered');
  });

  describe('a single protected file', () => {
    const lockedFile = () => new File(
      [new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/__fixtures__/encrypted/needs-password.pdf')))],
      'locked.pdf',
      { type: 'application/pdf' },
    );
    const mountLocked = async (props?: PdfMergeToolProps) => {
      await mount([lockedFile()], props);
      // The real probe asks the shipped pdf.js; the wait is on its answer, and the locked state is then asserted.
      await waitUntil(() => view.workspace.state.lockedProbe !== null);
      expect(view.workspace.state.lockedProbe?.kind).toBe('needs-password');
      await waitUntil(() => expect(container.querySelector('[data-needs-unlock]')).not.toBeNull());
    };

    it('shows the locked state in place of the result area, with Add files still available', async () => {
      await mountLocked();
      expect(container.querySelector('[data-needs-unlock]')?.getAttribute('data-needs-unlock')).toBe('needs-password');
      expect(container.textContent).not.toContain("That didn't work");
      expect(container.textContent).not.toContain('0 pages');
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('[aria-label="Undo last change"]')).toBeNull();
      expect(container.querySelector('#page-grid-heading')).toBeNull();
      expect(fileNames()).toEqual(['locked.pdf']);
      expect(buttonLabels()).toContain('Add files');
    });

    it('offers no "add one more file" box beside it', async () => {
      await mountLocked();
      expect(container.querySelector('[data-state="one-file"]')).toBeNull();
    });

    it('shows the Hebrew locked-state copy on the Hebrew edition', async () => {
      await mountLocked({ messages: hebrewMergeMessages, shellMessages: hebrewShellMessages });
      expect(container.textContent).toContain(hebrewMergeMessages.protectedNeedsPasswordTitle);
      expect(container.textContent).toContain(hebrewMergeMessages.protectedUnlockIt);
    });
  });
});
