import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hydrate, render } from 'preact';
import { act } from 'preact/test-utils';
import { renderToString } from 'preact-render-to-string';
import Sortable from 'sortablejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfMergeTool from './PdfMergeTool.tsx';
import type { PdfMergeToolProps } from './hooks/useMergeTool.ts';
import { hebrewMergeMessages } from './messages.ts';
import { hebrewShellMessages } from '#shell/shellMessages.ts';
import { DEFAULT_QUIET } from '#lib/output/quietPrepare.ts';
import { HeldFile } from '../../test/support/heldFile.ts';
import { pagesPdf } from '../../test/support/mergeFixtures.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { openNewerStore } from '#lib/drafts/newerStore.test-helper.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';

describe('PdfMergeTool island', () => {
  let harness: ToolHarness;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
  });

  afterEach(async () => {
    if (container) act(() => render(null, container as HTMLDivElement));
    container?.remove();
    container = null;
    // The hand-off intake's IndexedDB read must end while the DOM still exists.
    await harness.settle();
    harness.restore();
  });

  function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfMergeTool />, container as HTMLDivElement));
    return container;
  }
  const dom = () => container as HTMLDivElement;
  const fileNames = () => Array.from(dom().querySelectorAll('ul[aria-describedby="reorder-hint"] > li [data-file-name]')).map((el) => el.textContent);
  // Every row has been read: a page count, or the lock or error it turned out to carry.
  const rowsRead = () => {
    const rows = Array.from(dom().querySelectorAll('ul[aria-describedby="reorder-hint"] > li'));
    return rows.length > 0 && rows.every((row) => (
      row.hasAttribute('data-error') || row.hasAttribute('data-locked') || !(row.querySelector('[data-testid="file-pages"]')?.textContent ?? '').includes('…')
    ));
  };
  async function loadFiles(names: string[]) {
    const files = await Promise.all(names.map((name) => pagesPdf([100, 100], name)));
    await act(async () => { setInputFiles(dom().querySelector('input[type="file"]'), files); });
    await waitUntil(() => rowsRead() && fileNames().length > 0);
  }
  const removeFile = (index: number) => act(async () => {
    dom().querySelectorAll('ul[aria-describedby="reorder-hint"] > li button[aria-label]')[index].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const firstEdits = async () => { await harness.flush(); return harness.usageEvents('tool_first_edit').map((event) => event.properties.tool); };

  it('renders the initial file dropper zone', () => {
    mount();
    const dropzone = dom().querySelector('[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone?.textContent).toContain('Drop PDFs or photos here');
  });

  // Merge's empty-state sheet carries its own heading and body line (BasePdfTool's
  // `emptyHeading` / `emptyBody`) beside the Choose files button.
  it('shows the empty-state sheet with its own heading, body and Choose files', () => {
    mount();
    const dropzone = dom().querySelector('[data-dropzone]') as Element;
    // Desktop heading and the phone heading (t.dropHere) are both in the markup; CSS shows one.
    const spans = [...dropzone.querySelectorAll('strong > span')].map((n) => n.textContent);
    expect(spans).toEqual(['Drop PDFs or photos here', 'Drop PDFs or photos here, or paste']);
    expect(dropzone.textContent).toContain('Your pages appear here, in order, before you download. Files never leave your device.');
    expect(dropzone.textContent).toContain('Choose files');
  });

  it('lets the file picker choose JPEG and PNG photos beside PDFs (MERGE-22)', () => {
    mount();
    const accept = dom().querySelector('input[type="file"]')?.getAttribute('accept');
    expect(accept).toContain('application/pdf');
    expect(accept).toContain('image/jpeg');
    expect(accept).toContain('image/png');
  });

  it('DEBT-58: the first files arriving are not an edit; a remove and a later add are', async () => {
    // A first edit is sent once per accepted file, so each kind of change starts from a fresh page load.
    mount();
    await loadFiles(['one.pdf', 'two.pdf']);
    expect(await firstEdits()).toEqual([]);

    await removeFile(1);
    expect(await firstEdits()).toEqual(['merge']);

    act(() => render(null, dom()));
    dom().remove();
    harness.resetUsage();
    harness.clearBeacons();
    mount();
    await loadFiles(['one.pdf', 'two.pdf']);
    expect(await firstEdits()).toEqual([]);
    await loadFiles(['three.pdf']);
    expect(await firstEdits()).toEqual(['merge']);
  });

  it('DEBT-58: files added again after Clear all are the file arriving again, not an edit', async () => {
    // Acceptance is already marked by then, so only the add itself can tell an arrival from an edit.
    mount();
    await loadFiles(['one.pdf', 'two.pdf']);
    await act(async () => {
      const clear = Array.from(dom().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Clear all files') as HTMLButtonElement;
      clear.click();
    });
    await act(async () => {
      const confirm = Array.from(dom().querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Clear all').at(-1) as HTMLButtonElement;
      confirm.click();
    });
    await waitUntil(() => expect(fileNames()).toEqual([]));
    await loadFiles(['three.pdf', 'four.pdf']);
    expect(await firstEdits()).toEqual([]);
  });

  // MERGE-11: the heading's name IS the editable output file name, one contenteditable span. jsdom does
  // not synthesize keyboard input into it, so the text is set directly, as a person's keystrokes leave it.
  it('sanitises a renamed output on commit: strips path separators, trims, and caps at 120 characters', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    const nameEl = () => dom().querySelector('bdi [aria-label][tabindex]') as HTMLElement;

    await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { nameEl().textContent = `  ../evil\\name  ${'x'.repeat(200)}`; });
    await act(async () => { nameEl().blur(); });

    const committed = nameEl().textContent as string;
    expect(committed).not.toContain('/');
    expect(committed).not.toContain('\\');
    expect(committed.startsWith('..evilname')).toBe(true);
    expect(Array.from(committed)).toHaveLength(120);
  });
});

/* Files offered the moment the island hydrates, before the lazy draft module and
   the grid have loaded, land as entries. (A change event fired BEFORE hydration has
   no handler to hear it: that is a timing race for a caller to wait out, like the
   astro-island wait in the e2e specs.) */
describe('files offered right after hydration', () => {
  let harness: ToolHarness;
  let container: HTMLElement | null = null;
  beforeEach(() => { harness = installToolHarness({ trackIndexedDb: true }); });
  afterEach(async () => {
    // Unmount, then let the hand-off intake's IndexedDB read settle while the DOM still exists.
    if (container) act(() => render(null, container as HTMLElement));
    await harness.settle();
    container?.remove();
    container = null;
    harness.restore();
  });

  it('lands them as entries when offered straight after hydration starts', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(<PdfMergeTool />);
    await act(async () => { hydrate(<PdfMergeTool />, container as HTMLElement); });
    // No flush: the draft module and the grid have not loaded yet.
    const files = await Promise.all(['one.pdf', 'two.pdf', 'three.pdf'].map((name) => pagesPdf([100, 100], name)));
    const input = container.querySelector('input[type="file"]');
    await act(async () => { setInputFiles(input, files); });
    await waitUntil(() => expect(container?.querySelectorAll('[data-link-row]').length).toBe(3));
  });
});

/* The island's DOM from the first file to the download, over a real merge: the quiet wait is the real
   DEFAULT_QUIET on a fake clock. */
describe('the island from the first file to the download', () => {
  let harness: ToolHarness;
  let host: HTMLDivElement;

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(async () => {
    act(() => render(null, host));
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'share');
    localStorage.removeItem('pdf-toolkit:merge:options');
    // The hand-off intake's IndexedDB read must end while the DOM still exists.
    await harness.settle();
    harness.restore();
  });

  const twoPages = (name: string) => pagesPdf([100, 100], name);
  const lockedFile = (name: string) => new File(
    [new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/__fixtures__/encrypted/owner-only.pdf')))],
    name,
    { type: 'application/pdf' },
  );
  /** Reads fine until told otherwise, as a file whose inspection passes and whose merge read gives out. */
  class UnreadableLater extends File {
    broken = false;

    override async arrayBuffer(): Promise<ArrayBuffer> {
      if (this.broken) throw new Error('could not read');
      return super.arrayBuffer();
    }
  }

  const start = (props?: PdfMergeToolProps) => {
    if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    act(() => render(<PdfMergeTool {...props} />, host));
  };
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const q = <T extends Element>(selector: string) => host.querySelector<T>(selector);
  const names = () => Array.from(host.querySelectorAll('ul[aria-describedby="reorder-hint"] > li [data-file-name]')).map((el) => el.textContent);
  const box = () => q<HTMLAnchorElement>('a[data-state]');
  const link = () => q<HTMLAnchorElement>('a[data-state][href]');
  const buttonLabels = () => Array.from(host.querySelectorAll('button')).map((b) => b.textContent?.trim());
  const buttonNamed = (label: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  const rowsRead = () => {
    const rows = Array.from(host.querySelectorAll('ul[aria-describedby="reorder-hint"] > li'));
    return rows.length > 0 && rows.every((row) => (
      row.hasAttribute('data-error') || row.hasAttribute('data-locked') || !(row.querySelector('[data-testid="file-pages"]')?.textContent ?? '').includes('…')
    ));
  };
  const add = async (files: File[]) => {
    await act(async () => { setInputFiles(q('input[type="file"]'), files); });
    await waitUntil(() => rowsRead() && names().length > 0, { dueFakeTimers: true });
  };
  const built = async () => {
    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => link() !== null, { dueFakeTimers: true });
  };
  const chooseSort = async (label: string) => {
    await act(async () => { q<HTMLButtonElement>('button[aria-haspopup="listbox"]')?.click(); });
    const option = Array.from(document.body.querySelectorAll('[role="option"]')).find((item) => item.textContent?.trim() === label) as HTMLElement;
    await act(async () => { option.click(); });
  };
  const nameEl = () => q<HTMLElement>('bdi [aria-label][tabindex]') as HTMLElement;

  it('lists one file with its page count, offers no hand-off, and Choose files opens the picker (M03)', async () => {
    start();
    await add([await pagesPdf([100, 100, 100], 'one.pdf')]);
    expect(names()).toEqual(['one.pdf']);
    expect(q('[data-testid="file-pages"]')?.textContent).toBe('3');
    expect(box()?.getAttribute('data-state')).toBe('one-file');
    expect(box()?.hasAttribute('disabled')).toBe(false);
    expect(box()?.textContent).toContain('Add one more file to merge');
    expect(link()).toBeNull();
    expect(harness.createdBlobs()).toHaveLength(0);
    expect(buttonLabels()).not.toContain('Compress');
    expect(buttonLabels()).not.toContain('Sign');
    expect(buttonLabels()).not.toContain('Options');
    expect(q('details')).toBeNull();
    expect(q('[data-count]')).toBeNull();
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click');
    await act(async () => { (Array.from((box() as HTMLElement).querySelectorAll('button')).find((b) => b.textContent === 'Choose files') as HTMLButtonElement).click(); });
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it('turns one Download element into the link, says 4 pages, never offers a Merge step, and Share sends the merged file (M06)', async () => {
    const share = vi.fn();
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    start();
    await add([await twoPages('Invoice 2024-03-01.pdf'), await twoPages('doc2.pdf')]);
    expect(box()?.getAttribute('data-state')).toBe('ready');
    expect(box()?.hasAttribute('href')).toBe(false);
    expect(host.textContent).not.toContain('Merge 2 PDFs');
    await built();
    expect(host.querySelectorAll('a[data-state]')).toHaveLength(1);
    expect(link()?.getAttribute('data-state')).toBe('ready');
    expect(link()?.getAttribute('download')).toBe('merged_Invoice 2024-03-01.pdf');
    expect(link()?.textContent).toContain('4 pages');
    expect(q('#page-grid-heading')?.textContent).toContain('4 pages');
    expect(host.textContent).not.toContain('Merge 2 PDFs');
    await act(async () => { buttonNamed('Share')?.click(); });
    expect(share).toHaveBeenCalledOnce();
    const shared = (share.mock.calls[0][0] as ShareData).files as File[];
    expect(shared.map((file) => file.name)).toEqual(['merged_Invoice 2024-03-01.pdf']);
    expect(await shared[0].arrayBuffer()).toEqual(await (harness.blobForUrl(link()?.getAttribute('href') ?? null) as Blob).arrayBuffer());
  });

  it('keeps the merged_ prefix untranslated in the download name of a Hebrew first file', async () => {
    start();
    await add([await twoPages('אישור שנתי.pdf'), await twoPages('second.pdf')]);
    await built();
    expect(link()?.getAttribute('download')).toBe('merged_אישור שנתי.pdf');
  });

  it('a tap on the preparing Download is busy until the file lands, then offers Start again (M08)', async () => {
    const a = new HeldFile(new Uint8Array(await (await twoPages('a.pdf')).arrayBuffer()), 'a.pdf', { held: false });
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    start();
    await add([a, await twoPages('b.pdf')]);
    a.hold();
    let reading = false;
    void a.started.then(() => { reading = true; }); // reason: the promise only ever resolves
    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => reading, { dueFakeTimers: true });
    await act(async () => { box()?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(box()?.getAttribute('aria-busy')).toBe('true');
    expect(box()?.textContent).toContain('Preparing');
    expect(host.textContent).not.toContain('Start again');
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await act(async () => { a.release(); });
    await waitUntil(() => link() !== null, { dueFakeTimers: true });
    expect(clicks).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('Start again');
  });

  it('says every page is skipped on the Download element, not that it is preparing (M16)', async () => {
    start();
    await add([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    await waitUntil(() => q('button[aria-label^="Hide page"]') !== null, { dueFakeTimers: true });
    for (let hide = q<HTMLButtonElement>('button[aria-label^="Hide page"]'); hide; hide = q<HTMLButtonElement>('button[aria-label^="Hide page"]')) {
      await act(async () => { hide?.click(); });
    }
    await advance(DEFAULT_QUIET.maxMs);
    expect(box()?.getAttribute('data-state')).toBe('nothing');
    expect(box()?.textContent).toContain('Every page is skipped');
    expect(box()?.textContent).not.toContain('Preparing 0');
  });

  it('nudges on a duplicate by name in the status line and adds it anyway on request (M27)', async () => {
    start();
    await add([await twoPages('dup.pdf'), await twoPages('other.pdf')]);
    await add([await twoPages('dup.pdf')]);
    expect(names()).toEqual(['dup.pdf', 'other.pdf']);
    const status = q('[role="status"]') as HTMLElement;
    expect(status.textContent).toContain('"dup.pdf" is already in the list');
    await act(async () => { status.querySelector('button')?.click(); });
    await waitUntil(() => expect(names()).toEqual(['dup.pdf', 'other.pdf', 'dup.pdf']), { dueFakeTimers: true });
  });

  it('sorts with the styled menu, Reverse as its own option, and Undo brings the order and the sort choice back (M28, M29)', async () => {
    start();
    await add([await twoPages('b.pdf'), await twoPages('a.pdf'), await twoPages('c.pdf')]);
    const triggers = () => Array.from(host.querySelectorAll('button[aria-haspopup="listbox"]')).map((trigger) => trigger.textContent);
    expect(triggers().length).toBeGreaterThan(0);
    await chooseSort('Name A to Z');
    expect(names()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(triggers().every((text) => text?.includes('Name A to Z'))).toBe(true);
    await chooseSort('Reversed');
    expect(names()).toEqual(['c.pdf', 'b.pdf', 'a.pdf']);
    await chooseSort('Name A to Z');
    await act(async () => { q<HTMLButtonElement>('button[aria-label="Undo last change"]')?.click(); });
    expect(names()).toEqual(['c.pdf', 'b.pdf', 'a.pdf']);
    expect(triggers().some((text) => text?.includes('Name A to Z'))).toBe(false);
    await act(async () => { q<HTMLButtonElement>('button[aria-label="Redo last undone change"]')?.click(); });
    expect(names()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(triggers().every((text) => text?.includes('Name A to Z'))).toBe(true);
  });

  it('names an unreadable file in the alert, with no Unlock link, when the merge itself rejects it (M44)', async () => {
    const broken = new UnreadableLater([await (await twoPages('broken.pdf')).arrayBuffer()], 'broken.pdf', { type: 'application/pdf' });
    start();
    await add([await twoPages('a.pdf'), broken]);
    broken.broken = true;
    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => q('[role="alert"]') !== null, { dueFakeTimers: true });
    expect(q('[role="alert"]')?.textContent).toContain('"broken.pdf" could not be read');
    expect(q('[role="alert"] a')).toBeNull();
  });

  it('shows the page-numbers checkbox unchecked, then remembered on device and checked on a fresh mount (M30)', async () => {
    start();
    await add([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    const checkbox = () => q<HTMLInputElement>('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox().checked).toBe(false);
    expect(localStorage.getItem('pdf-toolkit:merge:options')).toBeNull();
    await act(async () => {
      checkbox().checked = true;
      checkbox().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(checkbox().checked).toBe(true);
    expect(JSON.parse(localStorage.getItem('pdf-toolkit:merge:options') as string)).toEqual({ addPageNumbers: true });
    act(() => render(null, host));
    start();
    await add([await twoPages('c.pdf'), await twoPages('d.pdf')]);
    expect(checkbox().checked).toBe(true);
  });

  it('keeps the whole-file drag on the rail after a page moves across files, and a drop regroups the pages (M66)', async () => {
    const create = vi.spyOn(Sortable, 'create');
    start();
    await add([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    const list = q('ul[aria-describedby="reorder-hint"]') as HTMLElement;
    const cells = () => Array.from(host.querySelectorAll('ul[data-page-grid] > li[data-key]'));
    await waitUntil(() => cells().length === 4, { dueFakeTimers: true });
    await act(async () => { cells()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(host.textContent).toContain('Pages moved across files');
    expect(host.querySelectorAll('ul[aria-describedby="reorder-hint"] > li [role="button"]')).toHaveLength(2);
    expect(Sortable.get(list)?.option('disabled')).toBe(false);
    const railOptions = create.mock.calls.find(([element]) => element === list)?.[1] as Sortable.Options;
    await act(async () => { railOptions.onEnd?.({ oldIndex: 0, newIndex: 1 } as Sortable.SortableEvent); });
    expect(names()).toEqual(['b.pdf', 'a.pdf']);
    expect(host.textContent).not.toContain('Pages moved across files');
  });

  it('renames in the heading: one contenteditable name, no input chrome, and Enter puts it in the download name (M67)', async () => {
    start();
    await add([await twoPages('Invoice 2024-03-01.pdf'), await twoPages('doc2.pdf')]);
    await built();
    expect(nameEl().textContent).toBe('merged_Invoice 2024-03-01');
    expect(nameEl().getAttribute('contenteditable')).toBe('false');
    await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(nameEl().getAttribute('contenteditable')).not.toBe('false');
    expect(nameEl().getAttribute('role')).toBe('textbox');
    expect(q('input[type="text"]')).toBeNull();
    expect(nameEl().closest('button')).toBeNull();
    await act(async () => { nameEl().textContent = 'March invoices'; });
    await act(async () => { nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    await built();
    expect(nameEl().textContent).toBe('March invoices');
    expect(nameEl().getAttribute('contenteditable')).toBe('false');
    expect(q('bdi [dir="ltr"]')?.textContent).toBe('.pdf');
    expect(link()?.getAttribute('download')).toBe('March invoices.pdf');
  });

  it('shows the grid in the same commit that marks the workspace ready', async () => {
    start();
    await act(async () => { setInputFiles(q('input[type="file"]'), [await twoPages('a.pdf'), await twoPages('b.pdf')]); });
    const seen: string[] = [];
    await waitUntil(() => {
      const ready = q('[data-merge-workspace-ready]') !== null;
      const cells = host.querySelectorAll('ul[data-page-grid] > li[data-key]').length;
      seen.push(ready ? `ready:${cells}` : `waiting:${cells}`);
      return ready;
    }, { dueFakeTimers: true });
    expect(seen.at(-1)).toBe('ready:4');
    expect(seen.filter((state) => state.startsWith('ready'))).toEqual(['ready:4']);
  });

  it('says "Draft not saved" with no retention hint when the draft cannot be written (M53)', async () => {
    // A store already at a newer version: the product's own open fails with a real VersionError, so the draft write answers false.
    await openNewerStore();
    start();
    await add([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => q('[data-testid="draft-status-row"]') !== null, { dueFakeTimers: true });
    const row = q('[data-testid="draft-status-row"]') as HTMLElement;
    expect(row.textContent).toBe('Draft not saved');
    expect(host.textContent).not.toContain('Draft saved');
    expect(row.querySelector('[tabindex="0"][aria-describedby]')).toBeNull();
  });

  describe('a file name inside a Hebrew sentence is bidi-isolated (M80)', () => {
    const hebrew = { messages: hebrewMergeMessages, shellMessages: hebrewShellMessages };
    const isolated = (name: string) => `⁨${name}⁩`;

    it('in the duplicate notice', async () => {
      start(hebrew);
      await add([await twoPages('2025-dup.pdf'), await twoPages('other.pdf')]);
      await add([await twoPages('2025-dup.pdf')]);
      expect(q('[role="status"]')?.textContent).toContain(isolated('2025-dup.pdf'));
    });

    it('in the skipped-file notice', async () => {
      start(hebrew);
      await add([await twoPages('a.pdf'), new File(['x'], '2025-notes.txt', { type: 'text/plain' })]);
      expect(q('[role="status"]')?.textContent).toContain(isolated('2025-notes.txt'));
    });

    it('in the notice for an encrypted file', async () => {
      start(hebrew);
      await add([await twoPages('a.pdf'), lockedFile('2025-locked.pdf'), await twoPages('b.pdf')]);
      await waitUntil(() => q('[data-locked-notice]') !== null, { dueFakeTimers: true });
      expect(q('[data-locked-notice]')?.textContent).toContain(isolated('2025-locked.pdf'));
    });

    it('in the error for an unreadable file', async () => {
      start(hebrew);
      await add([await twoPages('a.pdf'), new File(['not a pdf'], '2025-broken.pdf', { type: 'application/pdf' }), await twoPages('b.pdf')]);
      await waitUntil(() => q('[role="alert"]') !== null, { dueFakeTimers: true });
      expect(q('[role="alert"]')?.textContent).toContain(isolated('2025-broken.pdf'));
    });
  });
});
