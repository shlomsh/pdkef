import fs from 'fs';
import path from 'path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { movePlanEntry, rotateEntry, skipAll, updateEntry, type PlanEntry } from '#lib/pages/pagePlan.ts';
import { useMergeTool, type PdfMergeToolProps } from './useMergeTool.ts';
import { mergePdfs } from '../lib/merge.js';
import { HeldFile } from '../../../test/support/heldFile.ts';
import { pagesPdf } from '../../../test/support/mergeFixtures.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';

vi.mock('../lib/merge.js', { spy: true });

type View = ReturnType<typeof useMergeTool>;

/* Every page of every fixture is told apart by its MediaBox: the width names the file (a registry, reset per
   test) and the height the page number in it, so a merged output read back with pdf-lib says where each page
   came from. */
const widthOf = new Map<string, number>();
const widthFor = (name: string) => {
  if (!widthOf.has(name)) widthOf.set(name, 100 + 10 * widthOf.size);
  return widthOf.get(name) as number;
};
const labelOfWidth = (width: number) => {
  const found = [...widthOf].find(([, w]) => w === width);
  return found ? found[0].replace('.pdf', '') : `?${width}`;
};
// pdf-lib yields on a timer, so while the clock is faked its work is nudged along without moving the clock.
async function nudged<T>(work: Promise<T>): Promise<T> {
  let done: { value: T } | null = null;
  void work.then((value) => { done = { value }; }); // reason: a rejection surfaces through `work` itself below
  await waitUntil(() => done !== null, { dueFakeTimers: true });
  return (done as unknown as { value: T }).value;
}
const pdf = (name: string, pages = 2) => nudged(pagesPdf(Array.from({ length: pages }, () => widthFor(name)), name));
const bytesOf = async (name: string, pages = 2) => new Uint8Array(await (await pdf(name, pages)).arrayBuffer());

const fixtureBytes = (name: string) => fs.readFileSync(path.resolve(__dirname, '../../../lib/__fixtures__', name));
const photo = (name: string, type: string) => new File([fixtureBytes(type === 'image/png' ? 'photo-2.png' : 'photo-1.jpg')], name, { type });

/** A File that reads fine until told otherwise, as a file whose inspection passes and whose merge read gives out. */
class UnreadableLater extends File {
  broken = false;

  override async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.broken) throw new Error('could not read');
    return super.arrayBuffer();
  }
}

// A merged output read back with pdf-lib: one `name:page:rotation` per page, and the document title.
async function readOutput(blob: Blob) {
  const doc = await nudged(PDFDocument.load(await blob.arrayBuffer()));
  const pages = doc.getPages().map((page) => `${labelOfWidth(page.getSize().width)}:${(page.getSize().height - 300) / 10}:${page.getRotation().angle}`);
  return { pages, title: doc.getTitle() };
}

// What each output page says in text: only the stamped page numbers are text in these fixtures.
async function pageTexts(blob: Blob) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useWorkerFetch: false });
  const doc = await nudged(loadingTask.promise);
  const texts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await nudged((await nudged(doc.getPage(i))).getTextContent());
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join('').trim());
  }
  await loadingTask.destroy();
  return texts;
}

describe('useMergeTool: the file list, the plan and the pre-merge', () => {
  let harness: ToolHarness;
  let host: HTMLDivElement;
  let view: { current: View | null };
  let builtBefore = 0;

  function Probe({ props }: { props?: PdfMergeToolProps }) {
    view.current = useMergeTool(props);
    return null;
  }
  const mount = (props?: PdfMergeToolProps) => act(() => render(<Probe props={props} />, host));
  const unmount = () => act(() => render(null, host));
  const v = () => view.current as View;

  // pdf-lib, fake-indexeddb and the lazy chunks answer on the real event loop, and pdf-lib yields on timers:
  // move the fake clock in small steps and give the real loop a few turns after each.
  const advance = (ms: number) => act(async () => {
    for (let left = ms; left > 0; left -= 10) {
      await vi.advanceTimersByTimeAsync(Math.min(10, left));
      for (let turn = 0; turn < 3; turn += 1) await drainPromises();
    }
  });
  const add = (files: File[]) => act(async () => { v().base.onFilesAdded(files); await drainPromises(); });
  const read = () => waitUntil(
    () => v().workspace.entries.length > 0 && v().workspace.entries.every((e) => e.pageCount !== null || e.error),
    { dueFakeTimers: true },
  );
  const addAndRead = async (files: File[]) => { await add(files); await read(); };
  // Moves the fake clock on in small steps until the state holds: a build needs a few timer ticks of its own.
  const clockUntil = async (check: () => boolean) => {
    for (let step = 0; step < 400 && !check(); step += 1) await advance(10);
    expect(check()).toBe(true);
  };
  const readStarted = async (file: HeldFile) => {
    let started = false;
    void file.started.then(() => { started = true; }); // reason: the promise only ever resolves
    await clockUntil(() => started);
  };
  const ready = () => clockUntil(() => v().workspace.prepared.status === 'ready' && v().workspace.prepared.url !== null);
  // Waits out the quiet time of the pre-merge and the merge itself.
  const built = async () => { await advance(1500); await ready(); };
  // Builds that have landed since the set was first built: distinct blobs, because a cached result handed back is the same blob again.
  const builtSince = () => new Set(harness.createdBlobs()).size - builtBefore;

  const names = () => v().workspace.entries.map((e) => e.file.name);
  const idOf = (name: string) => v().workspace.entries.find((e) => e.file.name === name)?.id as number;
  // The page plan as the grid would show it: `name:page:rotation:skipped` per cell, in order.
  const planOf = () => v().workspace.plan.map((p) => {
    const file = v().workspace.entries.find((e) => e.id === p.fileId);
    return `${(file?.file.name ?? '?').replace('.pdf', '')}:${p.pageIndex}:${p.rotation}:${p.skipped ? 's' : '-'}`;
  });
  const edit = (update: (plan: PlanEntry[]) => PlanEntry[]) => act(() => v().workspace.onPlanChange(update));
  const undo = () => act(() => v().workspace.onUndo());
  const redo = () => act(() => v().workspace.onRedo());
  const outputOfBuild = () => readOutput(v().workspace.prepared.blob as Blob);

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    widthOf.clear();
    vi.mocked(mergePdfs).mockClear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    host = document.createElement('div');
    view = { current: null };
    mount();
  });

  afterEach(async () => {
    unmount();
    vi.useRealTimers();
    // The hand-off intake's IndexedDB read must end while the DOM still exists.
    await harness.settle();
    harness.restore();
  });

  it('lists one file with its page count and gives no download, since a merge needs a second file (M03)', async () => {
    await addAndRead([await pdf('one.pdf', 3)]);
    expect(names()).toEqual(['one.pdf']);
    expect(v().workspace.entries[0].pageCount).toBe(3);
    expect(v().workspace.downloadFlow.downloadState).toBe('one-file');
    await advance(5000);
    expect(v().workspace.prepared.status).toBe('idle');
    expect(v().workspace.downloadFlow.downloadLinkReady).toBe(false);
    expect(harness.createdBlobs()).toHaveLength(0);
  });

  it('pre-merges two files on idle: ready look first, then a download named after the first file whose pages are the merge (M06)', async () => {
    await addAndRead([await pdf('Invoice 2024-03-01.pdf'), await pdf('doc2.pdf')]);

    // Before the quiet wait ends Download already has its ready look, with no link yet.
    expect(v().workspace.downloadFlow.downloadState).toBe('ready');
    expect(v().workspace.prepared.url).toBeNull();
    await advance(1400);
    expect(harness.createdBlobs()).toHaveLength(0);
    await advance(100);
    await ready();

    expect(harness.createdBlobs()).toHaveLength(1);
    const { prepared, fileName, outputCount } = v().workspace;
    expect(fileName).toBe('merged_Invoice 2024-03-01.pdf');
    expect(outputCount).toBe(4);
    expect(prepared.pageCount).toBe(4);
    expect(v().workspace.downloadFlow.downloadState).toBe('ready');
    expect(v().workspace.downloadFlow.downloadLinkReady).toBe(true);
    const output = await outputOfBuild();
    expect(output.title).toBe('merged_Invoice 2024-03-01');
    expect(output.pages).toEqual(['Invoice 2024-03-01:0:0', 'Invoice 2024-03-01:1:0', 'doc2:0:0', 'doc2:1:0']);
    const linked = harness.blobForUrl(prepared.url) as Blob;
    expect(new Uint8Array(await linked.arrayBuffer())).toEqual(new Uint8Array(await harness.createdBlobs()[0].arrayBuffer()));
  });

  it('a tap while the pre-merge is still running shows progress and delivers the file when it lands (MERGE-12)', async () => {
    const a = new HeldFile(await bytesOf('a.pdf'), 'a.pdf', { held: false });
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await addAndRead([a, await pdf('b.pdf')]);
    // The merge reads each file once more after its inspection: hold that read open, so the build is in flight.
    a.hold();
    await advance(1500);
    await readStarted(a);

    await act(async () => { v().workspace.downloadFlow.onRowPreparingTap(); });
    expect(v().workspace.downloadFlow.downloadState).toBe('preparing');
    expect(clicks).not.toHaveBeenCalled();

    await act(async () => { a.release(); });
    await ready();
    expect(clicks).toHaveBeenCalledOnce();
    expect(clicks.mock.contexts[0]).toMatchObject({ download: 'merged_a.pdf' });
    expect((await outputOfBuild()).pages).toHaveLength(4);
    expect(v().workspace.downloadFlow.downloadState).toBe('saved');
    clicks.mockRestore();
  });

  it('any change to the list cancels the pending pre-merge and starts a new one', async () => {
    const a = new HeldFile(await bytesOf('a.pdf'), 'a.pdf', { held: false });
    await addAndRead([a, await pdf('b.pdf')]);
    // The first build is held in flight when the list changes, so the abort is what has to stop it.
    a.hold();
    await advance(1500);
    await readStarted(a);
    expect(mergePdfs).toHaveBeenCalledTimes(1);
    const firstSignal = vi.mocked(mergePdfs).mock.calls[0][3] as AbortSignal;
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(firstSignal.aborted).toBe(false);

    await addAndRead([await pdf('c.pdf')]);
    // The build for the old order was told to stop.
    expect(firstSignal.aborted).toBe(true);
    // Nothing is on offer for the old order while the new one is still to come.
    expect(v().workspace.prepared.url).toBeNull();
    await act(async () => { a.release(); });
    await built();
    // Only the build for the new list landed: the held one was cancelled and never produced a file.
    expect(harness.createdBlobs()).toHaveLength(1);
    expect((await outputOfBuild()).pages).toEqual(['a:0:0', 'a:1:0', 'b:0:0', 'b:1:0', 'c:0:0', 'c:1:0']);
    expect(v().workspace.fileName).toBe('merged_a.pdf');
  });

  it('accepts a .pdf and photos with an empty MIME type and still skips a real non-photo (MERGE-02, MERGE-22)', async () => {
    const typeless = new File([await (await pdf('typeless.pdf')).arrayBuffer()], 'typeless.pdf', { type: '' });
    await addAndRead([
      typeless,
      new File(['x'], 'report.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      photo('photo.png', 'image/png'),
      photo('scan.jpg', ''),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    ]);
    expect(names()).toEqual(['typeless.pdf', 'photo.png', 'scan.jpg']);
    expect(v().hints.rejectedFiles).toEqual(['report.docx', 'notes.txt']);
  });

  it('takes a mixed pick in pick order and gives each photo one plan page (MERGE-22)', async () => {
    await addAndRead([await pdf('a.pdf'), photo('shot.jpg', 'image/jpeg'), await pdf('b.pdf', 3), photo('pic.png', 'image/png')]);
    expect(names()).toEqual(['a.pdf', 'shot.jpg', 'b.pdf', 'pic.png']);
    expect(planOf()).toEqual(['a:0:0:-', 'a:1:0:-', 'shot.jpg:0:0:-', 'b:0:0:-', 'b:1:0:-', 'b:2:0:-', 'pic.png:0:0:-']);
    await built();
    expect((await outputOfBuild()).pages).toHaveLength(7);
  });

  it('removes a file and Undo puts it back at its old position, Redo removes it again (MERGE-07)', async () => {
    await addAndRead([await pdf('one.pdf'), await pdf('two.pdf'), await pdf('three.pdf')]);
    await built();
    expect(v().workspace.canUndo).toBe(false);

    await act(async () => v().workspace.onRemove(idOf('two.pdf')));
    expect(names()).toEqual(['one.pdf', 'three.pdf']);

    await undo();
    expect(names()).toEqual(['one.pdf', 'two.pdf', 'three.pdf']);
    await ready();
    expect((await outputOfBuild()).pages).toEqual(['one:0:0', 'one:1:0', 'two:0:0', 'two:1:0', 'three:0:0', 'three:1:0']);

    await redo();
    expect(names()).toEqual(['one.pdf', 'three.pdf']);
    expect(v().workspace.canRedo).toBe(false);
  });

  describe('undo and redo', () => {
    async function mountWithPages() {
      await addAndRead([await pdf('a.pdf'), await pdf('b.pdf')]);
      await built();
      expect(planOf()).toHaveLength(4);
    }

    it('skips a page, then Undo includes it and Redo skips it again', async () => {
      await mountWithPages();
      await edit((plan) => updateEntry(plan, plan[0].key, { skipped: true }));
      expect(planOf()[0]).toBe('a:0:0:s');
      await undo();
      expect(planOf()[0]).toBe('a:0:0:-');
      await redo();
      expect(planOf()[0]).toBe('a:0:0:s');
    });

    it('skipping every page says nothing is left to merge, not that it is preparing', async () => {
      await mountWithPages();
      await edit(skipAll);
      await advance(1500);
      expect(v().workspace.downloadFlow.downloadState).toBe('nothing');
      expect(v().workspace.outputCount).toBe(0);
    });

    it('rotates a page, then Undo and Redo move it back and forth', async () => {
      await mountWithPages();
      await edit((plan) => rotateEntry(plan, plan[1].key, 90));
      expect(planOf()[1]).toBe('a:1:90:-');
      await undo();
      expect(planOf()[1]).toBe('a:1:0:-');
      await redo();
      expect(planOf()[1]).toBe('a:1:90:-');
    });

    it('moves a page, then Undo and Redo restore the order', async () => {
      await mountWithPages();
      await edit((plan) => movePlanEntry(plan, 0, 1));
      expect(planOf().slice(0, 2)).toEqual(['a:1:0:-', 'a:0:0:-']);
      await undo();
      expect(planOf().slice(0, 2)).toEqual(['a:0:0:-', 'a:1:0:-']);
      await redo();
      expect(planOf().slice(0, 2)).toEqual(['a:1:0:-', 'a:0:0:-']);
    });

    it('reorders files with the keyboard, then Undo and Redo restore the list and the pages', async () => {
      await mountWithPages();
      const key = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      await act(async () => v().workspace.onRowKeyDown(key, idOf('a.pdf')));
      expect(key.defaultPrevented).toBe(true);
      expect(names()).toEqual(['b.pdf', 'a.pdf']);
      expect(planOf()[0]).toBe('b:0:0:-');
      await undo();
      expect(names()).toEqual(['a.pdf', 'b.pdf']);
      expect(planOf()[0]).toBe('a:0:0:-');
      await redo();
      expect(names()).toEqual(['b.pdf', 'a.pdf']);
    });

    it.each([['after', true], ['before', false]])('a file removed before its inspection finished still gets its pages when it finishes %s Undo', async (_, afterUndo) => {
      // slow.pdf's inspection is held open: its bytes are not given up until it is released.
      const slow = new HeldFile(await bytesOf('slow.pdf', 3), 'slow.pdf');
      await add([slow, await pdf('b.pdf')]);
      await waitUntil(() => planOf().length === 2, { dueFakeTimers: true });
      expect(planOf()).toEqual(['b:0:0:-', 'b:1:0:-']);
      await act(async () => v().workspace.onRemove(idOf('slow.pdf')));
      expect(names()).toEqual(['b.pdf']);
      if (!afterUndo) await act(async () => { slow.release(); await drainPromises(); });
      await undo();
      expect(names()).toEqual(['slow.pdf', 'b.pdf']);
      if (afterUndo) await act(async () => { slow.release(); await drainPromises(); });
      await waitUntil(() => expect(planOf().filter((p) => p.startsWith('slow:'))).toHaveLength(3), { dueFakeTimers: true });
    });

    it('adding files is not a step', async () => {
      await mountWithPages();
      await addAndRead([await pdf('c.pdf')]);
      expect(names()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
      expect(v().workspace.canUndo).toBe(false);
      await edit((plan) => rotateEntry(plan, plan[0].key, 90));
      await addAndRead([await pdf('d.pdf')]);
      await undo();
      expect(names()).toEqual(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']);
      expect(planOf()[0]).toBe('a:0:0:-');
      expect(planOf()).toHaveLength(8);
    });
  });

  it('nudges on a duplicate (same name and size) and lets it be added anyway (MERGE-07)', async () => {
    const dup = await pdf('dup.pdf');
    await addAndRead([dup, await pdf('other.pdf', 3)]);
    await addAndRead([dup]);

    expect(names()).toEqual(['dup.pdf', 'other.pdf']);
    expect(v().hints.duplicates.map((f) => f.name)).toEqual(['dup.pdf']);

    await act(async () => { v().hints.onAddAnyway(v().hints.duplicates); await drainPromises(); });
    await waitUntil(() => expect(names()).toEqual(['dup.pdf', 'other.pdf', 'dup.pdf']), { dueFakeTimers: true });
  });

  it('sorting regroups the plan to match, Reverse being its own option', async () => {
    await addAndRead([await pdf('b.pdf'), await pdf('a.pdf'), await pdf('c.pdf')]);

    await act(async () => v().workspace.onSortChange('nameAsc'));
    expect(names()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);

    await act(async () => v().workspace.onSortChange('reversed'));
    expect(names()).toEqual(['c.pdf', 'b.pdf', 'a.pdf']);

    await built();
    expect((await outputOfBuild()).pages).toEqual(['c:0:0', 'c:1:0', 'b:0:0', 'b:1:0', 'a:0:0', 'a:1:0']);
  });

  it('undoing a sort brings back the file order and the sort choice together', async () => {
    await addAndRead([await pdf('b.pdf'), await pdf('a.pdf'), await pdf('c.pdf')]);
    await act(async () => v().workspace.onSortChange('nameAsc'));
    expect(names()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(v().workspace.sortMode).toBe('nameAsc');

    await undo();
    expect(names()).toEqual(['b.pdf', 'a.pdf', 'c.pdf']);
    expect(v().workspace.sortMode).toBe('added');

    await redo();
    expect(names()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(v().workspace.sortMode).toBe('nameAsc');
  });

  it('remembers Add page numbers on device, stamps 1 to 4 and applies it on a fresh mount (MERGE-11)', async () => {
    await addAndRead([await pdf('a.pdf'), await pdf('b.pdf')]);
    expect(v().workspace.state.addPageNumbers).toBe(false);
    expect(localStorage.getItem('pdf-toolkit:merge:options')).toBeNull();

    // The checkbox's own change event, as the page-numbers row raises it.
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', v().workspace.onPageNumbersChange);
    await act(async () => { checkbox.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(v().workspace.state.addPageNumbers).toBe(true);
    await built();
    expect(await pageTexts(v().workspace.prepared.blob as Blob)).toEqual(['1', '2', '3', '4']);
    expect(JSON.parse(localStorage.getItem('pdf-toolkit:merge:options') as string)).toEqual({ addPageNumbers: true });

    unmount();
    mount();
    await addAndRead([await pdf('c.pdf'), await pdf('d.pdf')]);
    expect(v().workspace.state.addPageNumbers).toBe(true);
  });

  it('reports an unreadable file by name when the merge itself rejects it (MERGE-04)', async () => {
    // broken.pdf is readable when it is inspected and gives out when the merge reads it.
    const broken = new UnreadableLater([await (await pdf('broken.pdf')).arrayBuffer()], 'broken.pdf', { type: 'application/pdf' });
    await addAndRead([await pdf('a.pdf'), broken]);
    broken.broken = true;
    await advance(1500);
    await clockUntil(() => v().workspace.prepared.status === 'error');

    expect(v().workspace.failedEntry?.file.name).toBe('broken.pdf');
    expect(v().workspace.failedReason).toBe('unreadable');
    expect(v().workspace.otherError).toBe(false);
    expect(v().workspace.downloadFlow.downloadState).toBe('error');
  });

  it('keeps whole-file reorder available after pages are rearranged, and regroups the pages on it', async () => {
    await addAndRead([await pdf('a.pdf'), await pdf('b.pdf')]);
    expect(v().workspace.rearranged).toBe(false);

    // A page moves across the file boundary.
    await edit((plan) => movePlanEntry(plan, 1, 2));
    expect(planOf().slice(0, 3)).toEqual(['a:0:0:-', 'b:0:0:-', 'a:1:0:-']);
    expect(v().workspace.rearranged).toBe(true);
    expect(v().workspace.canReorderFiles).toBe(true);

    await act(async () => v().workspace.onRowKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }), idOf('a.pdf')));
    expect(names()).toEqual(['b.pdf', 'a.pdf']);
    expect(planOf()).toEqual(['b:0:0:-', 'b:1:0:-', 'a:0:0:-', 'a:1:0:-']);
    expect(v().workspace.rearranged).toBe(false);
  });

  describe('renaming the output file name', () => {
    const rename = (name: string) => act(() => v().workspace.onRename(name));

    it('Enter commits: the download name and the PDF title follow it', async () => {
      await addAndRead([await pdf('Invoice 2024-03-01.pdf'), await pdf('doc2.pdf')]);
      await built();
      expect(v().workspace.title).toBe('merged_Invoice 2024-03-01');

      await rename('March invoices');
      expect(v().workspace.title).toBe('March invoices');
      await built();
      expect(v().workspace.fileName).toBe('March invoices.pdf');
      expect((await outputOfBuild()).title).toBe('March invoices');
    });

    it('an empty name reverts to the automatic one', async () => {
      await addAndRead([await pdf('a.pdf'), await pdf('b.pdf')]);
      await rename('Something else');
      expect(v().workspace.title).toBe('Something else');
      await rename('');
      expect(v().workspace.title).toBe('merged_a');
    });

    it('once edited, the name survives adding, removing and reordering files', async () => {
      await addAndRead([await pdf('a.pdf'), await pdf('b.pdf')]);
      await rename('My renamed merge');

      await addAndRead([await pdf('c.pdf')]);
      expect(v().workspace.title).toBe('My renamed merge');

      await act(async () => v().workspace.onRemove(idOf('a.pdf')));
      expect(v().workspace.title).toBe('My renamed merge');

      await act(async () => v().workspace.onRowKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }), idOf('b.pdf')));
      expect(names()).toEqual(['c.pdf', 'b.pdf']);
      expect(v().workspace.title).toBe('My renamed merge');
    });

    it('Clear all resets it, so the next set gets the automatic name', async () => {
      await addAndRead([await pdf('a.pdf'), await pdf('b.pdf')]);
      await rename('My renamed merge');
      await act(async () => { v().base.clearAll?.onClear(); await drainPromises(); });
      await addAndRead([await pdf('fresh.pdf'), await pdf('other.pdf')]);
      expect(v().workspace.title).toBe('merged_fresh');
    });
  });

  it('is ready at once, with no build, after an undo back to a built set', async () => {
    await addAndRead([await pdf('a.pdf'), await pdf('b.pdf'), await pdf('c.pdf')]);
    await built();
    // Past the burst window, so the edits below are quiet again.
    await advance(4500);
    builtBefore = new Set(harness.createdBlobs()).size;

    await act(async () => v().workspace.onRemove(idOf('b.pdf')));
    await advance(300);
    await undo();
    expect(v().workspace.prepared.status).toBe('ready');
    expect(v().workspace.prepared.url).toBeTruthy();
    expect(v().workspace.downloadFlow.downloadState).toBe('ready');
    await advance(5000);
    expect(builtSince()).toBe(0);
  });
});
