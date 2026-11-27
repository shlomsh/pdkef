import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUIET } from '#lib/output/quietPrepare.ts';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { saveDraft, saveHandoff, takeHandoff } from '#lib/drafts/draftStore.ts';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';
import { noPagesKey } from '../../../test/support/pdfPageTreeFixtures.ts';
import { pagesPdf } from '../../../test/support/mergeFixtures.ts';
import { HeldFile } from '../../../test/support/heldFile.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import PdfMergeTool from '../PdfMergeTool.tsx';
import { setInputFiles } from '../../../test/support/setInputFiles.js';
import { MERGE_DRAFT_SCHEMA_VERSION, type MergeDraftRestore } from './useMergeDraft.ts';
import { useMergeTool, type PdfMergeToolProps } from './useMergeTool.ts';

let host: HTMLDivElement;
let view: ReturnType<typeof useMergeTool>;

function Probe(props: PdfMergeToolProps) {
  view = useMergeTool(props);
  return view.draft ? <view.draft.Component {...view.draft.props} /> : null;
}

let harness: ToolHarness;
let releaseStore: (() => Promise<void>) | null = null;

beforeAll(async () => {
  await import('../components/MergeDraftPersistence.tsx');
});

beforeEach(() => {
  vi.spyOn(window, 'scrollTo');
  harness = installToolHarness({ trackIndexedDb: true });
  host = document.createElement('div');
});

afterEach(async () => {
  await releaseStore?.();
  act(() => render(null, host));
  vi.useRealTimers();
  vi.restoreAllMocks();
  await harness.settle();
  harness.restore();
});

const mount = (props: PdfMergeToolProps = {}) => act(() => render(<Probe {...props} />, host));
const names = () => view.workspace.entries.map((entry) => entry.file.name);
const inspected = () => view.workspace.entries.length > 0
  && view.workspace.entries.every((entry) => entry.pageCount !== null || entry.error !== null);

interface StoredMerge { files: { fileName: string }[]; plan: { rotation: number }[]; outputName: string | null }
const storedMerge = async () => (await harness.storedDraft('merge')) as StoredMerge | null;
const bytesOf = (file: File) => file.arrayBuffer();
const storedFile = async (file: File) => ({ fileName: file.name, fileType: file.type, fileBytes: await bytesOf(file) });
const handoffOf = async (files: File[]) => ({ files: await Promise.all(files.map(storedFile)) });

const wholePlan = (files: File[], pages: number) => files.flatMap((_, fileId) => (
  Array.from({ length: pages }, (__, pageIndex) => ({ key: `${fileId}:${pageIndex}`, fileId, pageIndex, rotation: 0 as const, skipped: false }))
));

async function seedDraft(files: File[], extra: Partial<{ outputName: string | null; addPageNumbers: boolean }> = {}) {
  const plan = wholePlan(files, 2);
  expect(await saveDraft('merge', {
    files: await Promise.all(files.map(storedFile)),
    plan,
    options: { addPageNumbers: extra.addPageNumbers ?? false },
    fileName: `merged_${files[0].name.replace('.pdf', '')}`,
    outputName: extra.outputName ?? null,
    pageCount: plan.length,
    fileCount: files.length,
    schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
  })).toBe(true);
}

const restoreOf = (files: File[]): MergeDraftRestore => ({
  files, plan: wholePlan(files, 2), options: { addPageNumbers: false }, outputName: null,
});

const draftSurface = () => waitUntil(() => expect(view.draft).not.toBeNull());

// forced: a real readwrite transaction on the draft store, kept busy so a read that starts after it queues until releaseStore runs.
async function holdStore() {
  const [{ name }] = await indexedDB.databases();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(name as string);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const tx = db.transaction(db.objectStoreNames[0], 'readwrite');
  const store = tx.objectStore(db.objectStoreNames[0]);
  let held = true;
  const finished = new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  const running = new Promise<void>((resolve) => {
    const request = () => {
      if (!held) return;
      store.get('held').onsuccess = request;
      resolve();
    };
    request();
  });
  await running;
  releaseStore = async () => {
    held = false;
    await finished;
    db.close();
    releaseStore = null;
  };
}

const twoPages = (name: string) => pagesPdf([100, 100], name);

describe('a restored draft', () => {
  it('is not a step: Undo has nothing to take back', async () => {
    await seedDraft([await twoPages('x.pdf'), await twoPages('y.pdf')]);
    mount();
    await waitUntil(() => names().length === 2 && inspected());
    expect(names()).toEqual(['x.pdf', 'y.pdf']);
    expect(view.workspace.canUndo).toBe(false);
  });
});

describe('a hand-off from the home page (SITE-42)', () => {
  it('loads the handed-off files as the set, in pick order, named like a manual pick', async () => {
    const files = await Promise.all(['c.pdf', 'a.pdf', 'b.pdf'].map(twoPages));
    expect(await saveHandoff('merge', await handoffOf(files))).toBe(true);
    mount();
    await waitUntil(() => names().length === 3 && inspected());
    expect(names()).toEqual(['c.pdf', 'a.pdf', 'b.pdf']);
    // It was taken, not copied: the hand-off is gone.
    expect(await takeHandoff('merge')).toBeNull();
    expect(view.workspace.fileName).toBe('merged_c.pdf');
  });

  it('lands a PDF and a photo from the home page in order (MERGE-22)', async () => {
    const photo = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/__fixtures__/photo-1.jpg')));
    const pdf = await twoPages('a.pdf');
    expect(await saveHandoff('merge', {
      files: [await storedFile(pdf), { fileName: 'snap.jpg', fileType: 'image/jpeg', fileBytes: photo.buffer.slice(0) }],
    })).toBe(true);
    mount();
    await waitUntil(() => names().length === 2 && inspected());
    expect(names()).toEqual(['a.pdf', 'snap.jpg']);
  });

  it('wins over a restore that lands after it, and leaves the saved set alone', async () => {
    const old = await Promise.all(['old1.pdf', 'old2.pdf'].map(twoPages));
    await seedDraft(old);
    expect(await saveHandoff('merge', await handoffOf(await Promise.all(['new1.pdf', 'new2.pdf'].map(twoPages))))).toBe(true);
    mount();
    await waitUntil(() => names().includes('new1.pdf') && inspected() && view.draft !== null);
    expect(names()).toEqual(['new1.pdf', 'new2.pdf']);
    act(() => view.draft?.props.onRestore(restoreOf(old), 'restore'));
    expect(names()).toEqual(['new1.pdf', 'new2.pdf']);
    expect(harness.recents().filter((entry) => entry.hasWork?.includes('merge')).map((entry) => entry.fileName)).toContain('merged_old1');
    expect((await storedMerge())?.files.map((file) => file.fileName)).toEqual(['old1.pdf', 'old2.pdf']);
  });

  it('replaces a restore that landed first instead of appending to it', async () => {
    const old = await Promise.all(['old1.pdf', 'old2.pdf'].map(twoPages));
    await seedDraft(old);
    expect(await saveHandoff('merge', await handoffOf(await Promise.all(['new1.pdf', 'new2.pdf'].map(twoPages))))).toBe(true);
    await holdStore();
    mount();
    await draftSurface();
    act(() => view.draft?.props.onRestore(restoreOf(old), 'restore'));
    expect(names()).toEqual(['old1.pdf', 'old2.pdf']);
    expect(view.workspace.state.showPickedUpSentence).toBe(true);
    await releaseStore?.();
    await waitUntil(() => names().includes('new1.pdf'));
    expect(names()).toEqual(['new1.pdf', 'new2.pdf']);
    expect(view.workspace.state.showPickedUpSentence).toBe(false);
    expect(harness.recents().filter((entry) => entry.hasWork?.includes('merge')).map((entry) => entry.fileName)).toContain('merged_old1');
    expect((await storedMerge())?.files.map((file) => file.fileName)).toEqual(['old1.pdf', 'old2.pdf']);
  });

  it('clears everything else the replaced set left behind: sort mode and history', async () => {
    const old = await Promise.all(['b.pdf', 'a.pdf', 'c.pdf'].map(twoPages));
    await seedDraft(old);
    expect(await saveHandoff('merge', await handoffOf(await Promise.all(['z.pdf', 'y.pdf'].map(twoPages))))).toBe(true);
    await holdStore();
    mount();
    await draftSurface();
    act(() => view.draft?.props.onRestore(restoreOf(old), 'restore'));
    act(() => view.workspace.onSortChange('nameAsc'));
    act(() => view.workspace.onRemove(view.workspace.entries[0].id));
    expect(view.workspace.sortMode).toBe('nameAsc');
    expect(view.workspace.canUndo).toBe(true);
    await releaseStore?.();
    await waitUntil(() => names().includes('z.pdf'));
    expect(names()).toEqual(['z.pdf', 'y.pdf']);
    expect(view.workspace.sortMode).toBe('added');
    expect(view.workspace.canUndo).toBe(false);
  });
});


const lockedFile = () => new File(
  [new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/__fixtures__/encrypted/owner-only.pdf')))],
  'locked.pdf',
  { type: 'application/pdf' },
);

class GivesOutFile extends File {
  givingOut = false;

  override async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.givingOut) throw new Error('could not read');
    return super.arrayBuffer();
  }
}

const fileNamesOnPage = () => Array.from(host.querySelectorAll('ul[aria-describedby="reorder-hint"] > li [data-file-name]')).map((el) => el.textContent);
const downloadBox = () => host.querySelector('a[data-state]');
const downloadLink = () => host.querySelector('a[data-state][href]');
const alertText = () => host.querySelector('[role="alert"]')?.textContent;
const addToIsland = (files: File[]) => act(async () => { setInputFiles(host.querySelector('input[type="file"]'), files); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

async function pagesOf(blob: Blob) {
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  return doc.getPages().map((page) => `${page.getSize().width}:${(page.getSize().height - 300) / 10}:${page.getRotation().angle}`);
}

/** What each output page says in text: only the stamped page numbers are text in these fixtures. */
async function pageTexts(blob: Blob) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const texts: string[] = [];
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const content = await (await pdf.getPage(page)).getTextContent();
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join('').trim());
  }
  await loadingTask.destroy();
  return texts;
}

describe('an encrypted file among several (MERGE-04)', () => {
  it('is named, links to Unlock, and the rest merge on the one offered action', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    act(() => render(<PdfMergeTool />, host));
    await addToIsland([await pagesPdf([100, 100], 'a.pdf'), lockedFile(), await pagesPdf([110, 110], 'b.pdf')]);
    await waitUntil(() => host.querySelector('[data-locked-notice]') !== null, { dueFakeTimers: true });
    await advance(5000);

    expect(harness.createdBlobs()).toHaveLength(0);
    const notice = host.querySelector('[data-locked-notice]');
    expect(notice?.textContent).toContain('"locked.pdf" is password-protected');
    expect(notice?.querySelector('a')?.getAttribute('href')).toBe('/unlock/');
    expect(host.textContent).not.toContain("That didn't work");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const row = host.querySelector('ul[aria-describedby="reorder-hint"] > li[data-locked]');
    expect(row?.querySelector('[data-file-name]')?.textContent).toBe('locked.pdf');
    expect(row?.hasAttribute('data-error')).toBe(false);
    // The lock is read out, not only drawn: true of a password and an owner-only lock alike.
    expect(row?.querySelector('[data-testid="file-pages"]')?.textContent).toBe('This PDF is protected');
    // The phone chip agrees with the rail row: a lock, not a page count.
    expect(host.querySelector('[data-testid="chip-row"] > li[data-locked] [data-testid="chip-pages"]')?.textContent).toBe('This PDF is protected');
    expect(downloadBox()?.getAttribute('data-state')).toBe('error');

    act(() => notice?.querySelector('button')?.click());
    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => downloadLink() !== null, { dueFakeTimers: true });
    expect(Array.from(host.querySelectorAll('ul[aria-describedby="reorder-hint"] > li [data-file-name]')).map((el) => el.textContent)).toEqual(['a.pdf', 'b.pdf']);
    expect(harness.createdBlobs()).toHaveLength(1);
    expect(await pagesOf(harness.createdBlobs()[0])).toEqual(['100:0:0', '100:1:0', '110:0:0', '110:1:0']);
    expect(host.querySelector('[data-locked-notice]')).toBeNull();
  });
});

describe('what the island reports (DEBT-44)', () => {
  const failedEvents = async () => { await harness.flush(); return harness.usageEvents('tool_operation_failed'); };

  it('does not count a file flagged encrypted by inspection as a failed operation', async () => {
    act(() => render(<PdfMergeTool />, host));
    await addToIsland([await pagesPdf([100, 100], 'a.pdf'), lockedFile()]);
    await waitUntil(() => expect(downloadBox()?.getAttribute('data-state')).toBe('error'));
    expect(await failedEvents()).toEqual([]);
  });

  it('does not count a file inspection finds unreadable, but reports the library error behind it', async () => {
    act(() => render(<PdfMergeTool />, host));
    await addToIsland([await pagesPdf([100, 100], 'a.pdf'), new File([new TextEncoder().encode('%PDF-1.4 this is not a PDF')], 'broken.pdf', { type: 'application/pdf' })]);
    await waitUntil(() => alertText() !== undefined);
    expect(alertText()).toContain('"broken.pdf" could not be read');
    expect(downloadBox()?.getAttribute('data-state')).toBe('error');
    expect(await failedEvents()).toEqual([]);
    // The report is of the library's own error behind it, not of the wrapper merge.js puts around it.
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'inspect_pdf', type: 'TypeError' }]);
  });

  it('reports an unexpected inspection failure and still shows the file unreadable', async () => {
    act(() => render(<PdfMergeTool />, host));
    await addToIsland([await pagesPdf([100, 100], 'a.pdf'), new File([noPagesKey().slice()], 'odd.pdf', { type: 'application/pdf' })]);
    await waitUntil(() => alertText() !== undefined);
    await harness.flush();
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'inspect_pdf' }]);
    expect(alertText()).toContain('"odd.pdf" could not be read');
    expect(await failedEvents()).toEqual([]);
  });

  it('still counts a failure of the merge run itself', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const bytes = new Uint8Array(await (await pagesPdf([110, 110], 'b.pdf')).arrayBuffer());
    const b = new GivesOutFile([bytes], 'b.pdf', { type: 'application/pdf' });
    act(() => render(<PdfMergeTool />, host));
    await addToIsland([await pagesPdf([100, 100], 'a.pdf'), b]);
    await waitUntil(() => rowsRead() && host.querySelectorAll('[data-testid="file-pages"]').length === 2, { dueFakeTimers: true });
    b.givingOut = true;
    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => expect(downloadBox()?.getAttribute('data-state')).toBe('error'), { dueFakeTimers: true });
    expect(await failedEvents()).toHaveLength(1);
  });
});

// Every row has been read: a page count, or the lock or error it turned out to carry.
const rowsRead = () => {
  const rows = Array.from(host.querySelectorAll('ul[aria-describedby="reorder-hint"] > li'));
  return rows.length > 0 && rows.every((row) => (
    row.hasAttribute('data-error') || row.hasAttribute('data-locked') || !row.querySelector('[data-testid="file-pages"]')?.textContent?.includes('\u2026')
  ));
};
const buttonNamed = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === label);

function navigation() {
  const waiting: ((href: string) => void)[] = [];
  const early: string[] = [];
  return {
    navigate: (href: string) => { const resolve = waiting.shift(); if (resolve) resolve(href); else early.push(href); },
    next: () => new Promise<string>((resolve) => { const href = early.shift(); if (href === undefined) waiting.push(resolve); else resolve(href); }),
  };
}

async function mergedIsland(navigate: (href: string) => void) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  act(() => render(<PdfMergeTool navigate={navigate} />, host));
  await addToIsland([await pagesPdf([100, 100], 'a.pdf'), await pagesPdf([110, 110], 'b.pdf')]);
  await waitUntil(rowsRead, { dueFakeTimers: true });
  await advance(DEFAULT_QUIET.maxMs);
  await waitUntil(() => downloadLink() !== null, { dueFakeTimers: true });
}

describe('handing the merged result on (MERGE-14)', () => {
  it('hands it to Compress without re-picking, keeping the merge draft', async () => {
    const place = navigation();
    await mergedIsland(place.navigate);
    await advance(800);
    await waitUntil(() => host.textContent?.includes('Draft saved'), { dueFakeTimers: true });

    // Buttons, not links, and no Split: the row is Compress and Sign only.
    expect(host.querySelector('a[href="/compress/"]')).toBeNull();
    expect(Array.from(host.querySelectorAll('button')).some((button) => button.textContent === 'Split it')).toBe(false);
    const navigated = place.next();
    act(() => buttonNamed('Compress')?.click());
    expect(await navigated).toBe('/compress/');
    // The hand-off is what Compress will find: the merged file, whole.
    const record = await takeHandoff('compress');
    expect(record?.fileName).toBe('merged_a.pdf');
    expect(Object.prototype.toString.call(record?.fileBytes)).toBe('[object ArrayBuffer]');
    expect(await pagesOf(new Blob([record?.fileBytes as ArrayBuffer]))).toEqual(['100:0:0', '100:1:0', '110:0:0', '110:1:0']);
    // Merge's own draft is still stored.
    expect((await storedMerge())?.files.map((file) => file.fileName)).toEqual(['a.pdf', 'b.pdf']);
  });

  // Both hand-off buttons disable themselves for the navigation they start, so a restored page used
  // to bring them back permanently greyed out (lib/hooks/useNavigatingAway.ts).
  it('offers the hand-offs again after a restore, rather than coming back greyed out', async () => {
    const place = navigation();
    await mergedIsland(place.navigate);

    const toCompress = place.next();
    act(() => buttonNamed('Compress')?.click());
    expect(await toCompress).toBe('/compress/');
    expect(buttonNamed('Sign')?.disabled).toBe(true);

    act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    expect(buttonNamed('Sign')?.disabled).toBe(false);
    const toSign = place.next();
    act(() => buttonNamed('Sign')?.click());
    expect(await toSign).toBe('/sign/');
  });

  // MEM-01/02: opening the merged output in Sign moves Sign's pointer to the output's own entry;
  // whatever Sign was pointed at, and its work, is untouched, so the hand-off goes straight through.
  it('hands it to Sign without asking, even when Sign already has a draft of its own (MEM-01/02)', async () => {
    // Sign has a draft of its own, so this test would catch a regression that brings the old ask-first check back.
    const contract = await pagesPdf([100], 'contract.pdf');
    expect(await saveDraft('sign', { fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes: await contract.arrayBuffer() })).toBe(true);
    const place = navigation();
    await mergedIsland(place.navigate);

    const navigated = place.next();
    act(() => buttonNamed('Sign')?.click());
    expect(await navigated).toBe('/sign/');
    expect((await takeHandoff('sign'))?.fileName).toBe('merged_a.pdf');
    // Sign's existing entry (and its work) is never touched by this hand-off.
    expect((await harness.storedDraft('sign'))?.fileName).toBe('contract.pdf');
    expect(Array.from(host.querySelectorAll('dialog')).find((dialog) => dialog.textContent?.includes('contract.pdf'))).toBeUndefined();
  });
});

describe('the action trail (DEBT-31)', () => {
  it('records what the person did, in order, through Clear all and adding again', async () => {
    mount();
    await act(async () => { view.base.onFilesAdded([await twoPages('a.pdf'), await twoPages('b.pdf')]); });
    await waitUntil(inspected);
    act(() => view.base.clearAll.onClear());
    await act(async () => { view.base.onFilesAdded([await twoPages('c.pdf'), await twoPages('d.pdf')]); });
    await waitUntil(inspected);
    expect(recentActions()).toEqual(['add_files', 'clear_all', 'add_files']);
  });
});

describe('the first saved result', () => {
  it('shows the install line once the merged file is ready', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    mount();
    expect(view.workspace.state.showInstallLine).toBe(false);
    await act(async () => { view.base.onFilesAdded([await twoPages('a.pdf'), await twoPages('b.pdf')]); });
    await waitUntil(inspected, { dueFakeTimers: true });
    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => view.workspace.prepared.status === 'ready', { dueFakeTimers: true });
    expect(view.workspace.state.showInstallLine).toBe(true);
  });
});

describe('the page numbers option', () => {
  it('stays off after being turned on and off again', async () => {
    mount();
    const change = (checked: boolean) => act(() => view.workspace.onPageNumbersChange({ target: { checked } } as unknown as Event));
    expect(view.workspace.state.addPageNumbers).toBe(false);
    change(true);
    expect(view.workspace.state.addPageNumbers).toBe(true);
    change(false);
    expect(view.workspace.state.addPageNumbers).toBe(false);
  });
});

describe('the output name (MERGE-11)', () => {
  it('is saved with the draft and restored as the customised name', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    mount();
    await act(async () => { view.base.onFilesAdded([await twoPages('a.pdf'), await twoPages('b.pdf')]); });
    await waitUntil(inspected, { dueFakeTimers: true });
    await advance(800);
    await waitUntil(() => view.workspace.state.draftSaveState === 'saved', { dueFakeTimers: true });
    expect((await storedMerge())?.outputName).toBeNull();

    act(() => view.workspace.onRename('Persisted name'));
    expect(view.workspace.state.draftSaveState).toBe('pending');
    await advance(800);
    await waitUntil(() => view.workspace.state.draftSaveState === 'saved', { dueFakeTimers: true });
    expect((await storedMerge())?.outputName).toBe('Persisted name');

    // A restore that carries an outputName brings the renamed heading back.
    act(() => render(null, host));
    await seedDraft([await twoPages('x.pdf'), await twoPages('y.pdf')], { outputName: 'Restored name' });
    mount();
    await waitUntil(() => names().length === 2, { dueFakeTimers: true });
    expect(view.workspace.title).toBe('Restored name');
  });
});

const plain = async (widths: number[], name: string) => new File([await (await pagesPdf(widths, name)).arrayBuffer()], name, { type: 'application/pdf' });

describe('Clear all', () => {
  it('forgets a quiet Download tap that was still waiting, so the next set is not delivered by it', async () => {
    const held = new HeldFile(new Uint8Array(await (await pagesPdf([100, 100], 'a.pdf')).arrayBuffer()), 'a.pdf', { held: false });
    const [b, d, e] = await Promise.all([plain([110, 110], 'b.pdf'), plain([120, 120], 'd.pdf'), plain([130, 130], 'e.pdf')]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    mount();
    act(() => view.base.onFilesAdded([held, b]));
    await waitUntil(inspected, { dueFakeTimers: true });
    // The build the tap starts never finishes.
    held.hold();
    act(() => view.workspace.downloadFlow.onQuietPreparingTap());
    expect(view.workspace.downloadFlow.tap).toBe('processing');

    act(() => view.base.clearAll.onClear());
    expect(names()).toEqual([]);
    act(() => view.base.onFilesAdded([d, e]));
    await waitUntil(inspected, { dueFakeTimers: true });
    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => view.workspace.prepared.status === 'ready', { dueFakeTimers: true });
    expect(view.workspace.downloadFlow.downloadState).toBe('ready');
    expect(view.workspace.downloadFlow.showStrip).toBe(false);
    act(() => view.workspace.downloadFlow.onDownloadTap());
    expect(view.workspace.downloadFlow.downloadState).toBe('saved');
    expect(view.workspace.downloadFlow.showStrip).toBe(false);
    held.release();
  });
});

describe('a saved draft (MERGE-13)', () => {
  it('restores into the list, the plan and the options, and clears on Start again', async () => {
    const [x, y] = await Promise.all([pagesPdf([100, 100], 'x.pdf'), pagesPdf([110, 110], 'y.pdf')]);
    const plan = [
      { key: '0:0', fileId: 0, pageIndex: 0, rotation: 90 as const, skipped: false },
      { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0 as const, skipped: true },
      { key: '0:1', fileId: 0, pageIndex: 1, rotation: 0 as const, skipped: false },
      { key: '1:1', fileId: 1, pageIndex: 1, rotation: 0 as const, skipped: false },
    ];
    expect(await saveDraft('merge', {
      files: await Promise.all([x, y].map(storedFile)),
      plan,
      options: { addPageNumbers: true },
      fileName: 'merged_x',
      outputName: null,
      pageCount: 3,
      fileCount: 2,
      schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    })).toBe(true);
    // The pre-paint script sets this when the pointer to a draft exists (hasDraftHint is true here, for real).
    document.documentElement.setAttribute('data-draft-hint', '1');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    act(() => render(<PdfMergeTool />, host));
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(true);
    // The hint alone holds the empty state back before the module has loaded.
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    await waitUntil(() => fileNamesOnPage().length === 2 && rowsRead(), { dueFakeTimers: true });
    expect(fileNamesOnPage()).toEqual(['x.pdf', 'y.pdf']);
    // The pre-paint hint attribute is gone once the check settled, so a later Clear all shows the dropzone instead of a blank card.
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    // The restored-draft sentence shows first, for its five seconds; only after that does the small "Draft saved" chip take its place.
    expect(host.textContent).toContain('Picked up where you left off');
    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => downloadLink() !== null && host.querySelector('[data-merge-workspace-ready]') !== null, { dueFakeTimers: true });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    const blob = harness.createdBlobs().at(-1) as Blob;
    expect(await pagesOf(blob)).toEqual(['100:0:90', '100:1:0', '110:1:0']);
    // Pages were interleaved across files, so the list shows the rearranged note.
    expect(host.textContent).toContain('Pages moved across files');
    expect(await pageTexts(blob)).toEqual(['1', '2', '3']);

    // After its five seconds the sentence gives way to the small chip for the rest of the session.
    await advance(5000);
    expect(host.textContent).not.toContain('Picked up where you left off');
    // A restored workspace is not saved again until the person changes it; the first change is.
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Rotate page 3"]')?.click());
    await advance(800);
    await waitUntil(() => host.textContent?.includes('Draft saved'), { dueFakeTimers: true });
    // MEM-11: the retention hint's trigger rides along with the saved chip.
    expect(host.querySelector('[data-testid="draft-status-row"] [tabindex="0"][aria-describedby]')).not.toBeNull();
    expect((await storedMerge())?.plan.map((entry) => entry.rotation)).toEqual([90, 0, 0, 90]);

    await advance(DEFAULT_QUIET.maxMs);
    await waitUntil(() => downloadLink() !== null, { dueFakeTimers: true });
    act(() => { downloadLink()?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    act(() => buttonNamed('Start again')?.click());
    await waitUntil(() => fileNamesOnPage().length === 0, { dueFakeTimers: true });
    vi.useRealTimers();
    await harness.settle();
    expect(await storedMerge()).toBeNull();
  });
});
