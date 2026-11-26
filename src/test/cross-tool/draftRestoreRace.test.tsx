import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import PdfSignTool from '../../tools/sign/PdfSignTool.tsx';
import PdfRedactTool from '../../tools/redact/PdfRedactTool.tsx';
import { cacheRecentFile, loadDraft, peekHandoff, saveDraft, saveHandoff } from '#lib/drafts/draftStore.ts';
import { holdDraftStore } from '#lib/drafts/heldStore.test-helper.ts';
import { drainPromises } from '../support/drainPromises.ts';
import { waitUntil } from '../support/waitUntil.ts';
import { setInputFiles } from '../support/setInputFiles.js';
import '../support/realPdfjs.ts';
import { RECENT_FILES_META_KEY } from '#lib/drafts/recentFilesKey.js';
import { buildPdf } from '../support/redactCheckPdfs.test-helper.ts';


// Regression coverage for the auto-resume "silent draft restore" race:
//
// Draft restore reads from IndexedDB asynchronously (see useDraftPersistence.js /
// draftStore.js), so it can still be in flight — or resolve late — after the user has
// already picked a fresh file. Both PdfSignTool and PdfRedactTool run a shared,
// multi-`await` loadPdf() from two independent triggers (draft restore, manual pick);
// without a guard, whichever call's async chain happens to settle last would silently
// overwrite the other's state, regardless of which one the user actually wanted.
//
// The draft store runs for real on fake-indexeddb: a test seeds the draft an earlier session left and the
// hand-off the home page parked. A slow IndexedDB read is a real write transaction held on the store
// (holdDraftStore), released when the test opens it; the real hasDraftHint is false because the seed
// removes its recents entry.

async function makePdfFile(name: string) {
  return new File([(await buildPdf([{ lines: [name] }])).slice().buffer], name, { type: 'application/pdf' });
}

// The seeded draft would open the tool in its restoring state, with no file input to pick with. Dropping its entry
// from the recents index (as a person clearing recents does) makes the real draft hint false, so every scenario
// starts in the empty state while the draft record itself stays in the store.
function hideSeededHint() {
  localStorage.setItem(RECENT_FILES_META_KEY, '[]');
}

// The draft an earlier session left, written by the real store. Its bytes differ from a fresh pick's so
// the two are different entries.
async function seedDraft(fileName: string, elements: unknown[]) {
  const saved = await saveDraft('sign', {
    fileName,
    fileType: 'application/pdf',
    fileBytes: (await buildPdf([{ lines: ['old draft'] }])).slice().buffer,
    elements,
    extra: {}
  });
  expect(saved).toBe(true);
  hideSeededHint();
}
async function seedRedactDraft(fileName: string, boxes: unknown[]) {
  const saved = await saveDraft('redact', {
    fileName,
    fileType: 'application/pdf',
    fileBytes: (await buildPdf([{ lines: ['old draft'] }])).slice().buffer,
    elements: boxes,
    extra: {}
  });
  expect(saved).toBe(true);
  hideSeededHint();
}

/** The same record with its bytes copied into the jsdom realm, where the shipped pdf.js accepts them. */
const inJsdomRealm = <T extends { fileBytes?: ArrayBuffer } | null | undefined>(record: T): T => (
  record?.fileBytes ? { ...record, fileBytes: new Uint8Array(record.fileBytes).slice().buffer } : record
);

vi.mock('#lib/drafts/draftStore.ts', { spy: true });

const announced = (container: HTMLElement, tag: 'p' | 'div') =>
  container.querySelector(`${tag}.sr-only[role="status"]`)?.textContent ?? '';

// The product awaits the held read and then checks whether the restore was superseded. Releasing the hold lets
// the stale restore run for real; the drain carries it into the render.
let hold: Awaited<ReturnType<typeof holdDraftStore>>;
let restoreRead: PromiseWithResolvers<Promise<unknown>>;
async function resolveRestore() {
  await act(async () => {
    await hold.release();
    // The restore's own read, which the product awaits on this same promise.
    await (await restoreRead.promise);
    await drainPromises();
  });
}

async function pickFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]');
  await act(async () => {
    setInputFiles(input, [file]);
  });
}

describe('draft-restore vs. manual file pick race', () => {
  let container: HTMLElement | null = null;

  const holdRestore = async () => {
    hold = await holdDraftStore();
  };

  // The chunks a restored or picked file loads lazily (annotation read-back, the pdf-lib wrapper, field
  // detection) load once per process and slowly; load them up front so a test measures the race, not the load.
  beforeAll(async () => {
    await Promise.all([
      import('#editor/comments/importAnnotations.ts'),
      import('#lib/pdf/pdfLib.js'),
      import('#lib/pdf/loadPdfPages.ts'),
      import('../../tools/sign/lib/fields/detectFormFields.ts')
    ]);
  });

  beforeEach(async () => {
    indexedDB = new IDBFactory();
    localStorage.clear();
    // Forced: fake-indexeddb clones with Node's structuredClone, so a restored draft's or hand-off's bytes are a Node-realm ArrayBuffer that fails the shipped pdf.js's `instanceof ArrayBuffer` in jsdom ('Invalid PDF binary data', measured with the wrappers removed); the real reads run, their bytes are copied into jsdom's realm, and pdf.js parses them for real. A browser has one realm, so no product line changes for it.
    restoreRead = Promise.withResolvers();
    const real = await vi.importActual<typeof import('#lib/drafts/draftStore.ts')>('#lib/drafts/draftStore.ts');
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: fake-indexeddb clones with Node's structuredClone, so a restored draft's or hand-off's bytes are a Node-realm ArrayBuffer that fails the shipped pdf.js's `instanceof ArrayBuffer` in jsdom ('Invalid PDF binary data', measured with the wrappers removed); the real reads run, their bytes are copied into jsdom's realm, and pdf.js parses them for real. A browser has one realm, so no product line changes for it.
    vi.mocked(loadDraft).mockImplementation((...args) => {
      const record = real.loadDraft(...args).then(inJsdomRealm);
      restoreRead.resolve(record);
      return record;
    });
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: fake-indexeddb clones with Node's structuredClone, so a restored draft's or hand-off's bytes are a Node-realm ArrayBuffer that fails the shipped pdf.js's `instanceof ArrayBuffer` in jsdom ('Invalid PDF binary data', measured with the wrappers removed); the real reads run, their bytes are copied into jsdom's realm, and pdf.js parses them for real. A browser has one realm, so no product line changes for it.
    vi.mocked(peekHandoff).mockImplementation(async (...args) => {
      const real = await vi.importActual<typeof import('#lib/drafts/draftStore.ts')>('#lib/drafts/draftStore.ts');
      return inJsdomRealm(await real.peekHandoff(...args));
    });
  });

  afterEach(async () => {
    if (container) {
      act(() => render(null, container!));
      container.remove();
      container = null;
    }
    // Work still in flight when the last assertion passed may log after the file is torn down.
    await act(async () => {
      await Promise.allSettled([...vi.mocked(cacheRecentFile).mock.results, ...vi.mocked(saveDraft).mock.results].map((result) => result.value));
      await drainPromises();
    });
    vi.clearAllMocks();
  });

  it('PdfSignTool: a manual pick that finishes before a slow restore resolves is not clobbered by the stale draft', async () => {
    await seedDraft('draft-old.pdf', [
      { id: 'stale-1', pageIndex: 0, x: 10, y: 10, type: 'text', text: 'stale' }
    ]);
    await holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    // Restore's loadDraft() is now in flight and unresolved.

    await pickFile(container, await makePdfFile('fresh-user-pick.pdf'));
    await waitUntil(() => announced(container!, 'p').includes('fresh-user-pick.pdf'));

    let announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('fresh-user-pick.pdf');
    expect(container.querySelectorAll('[data-editor-element]').length).toBe(0);

    // The stale restore resolves well after the fresh pick already finished loading.
    await resolveRestore();

    announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('fresh-user-pick.pdf');
    expect(announcement.textContent).not.toContain('draft-old.pdf');
    // Stale draft's element must never have been applied on top of the fresh file.
    expect(container.querySelectorAll('[data-editor-element]').length).toBe(0);
  });

  it('PdfSignTool: restores the draft normally when no manual pick preempts it', async () => {
    await seedDraft('draft-old.pdf', []);
    await holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    await resolveRestore();
    await waitUntil(() => announced(container!, 'p').includes('Restored your last draft of "draft-old.pdf"'));

    const announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('Restored your last draft of "draft-old.pdf"');
  });

  it('PdfRedactTool: a manual pick that finishes before a slow restore resolves is not clobbered by the stale draft', async () => {
    await seedRedactDraft('draft-old.pdf', [
      { id: 'stale-1', pageIndex: 0, left: 5, top: 5, width: 10, height: 10, style: 'blackout' }
    ]);
    await holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container!);
    });

    await pickFile(container, await makePdfFile('fresh-user-pick.pdf'));
    await waitUntil(() => announced(container!, 'div').includes('fresh-user-pick.pdf'));

    let announcement = container.querySelector('div.sr-only[role="status"]');
    expect(announcement.textContent).toContain('fresh-user-pick.pdf');
    expect(container.querySelectorAll('[data-redact-box-id]').length).toBe(0);

    await resolveRestore();

    announcement = container.querySelector('div.sr-only[role="status"]');
    expect(announcement.textContent).toContain('fresh-user-pick.pdf');
    expect(announcement.textContent).not.toContain('draft-old.pdf');
    expect(container.querySelectorAll('[data-redact-box-id]').length).toBe(0);
  });

  it('PdfRedactTool: restores the draft normally when no manual pick preempts it', async () => {
    await seedRedactDraft('draft-old.pdf', [
      { id: 'stale-1', pageIndex: 0, left: 5, top: 5, width: 10, height: 10, style: 'blackout' }
    ]);
    await holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container!);
    });

    await resolveRestore();
    await waitUntil(() => announced(container!, 'div').includes('Restored your last draft of "draft-old.pdf"')
      && container!.querySelectorAll('[data-redact-box-id]').length === 1);

    const announcement = container.querySelector('div.sr-only[role="status"]');
    expect(announcement.textContent).toContain('Restored your last draft of "draft-old.pdf"');
    expect(container.querySelectorAll('[data-redact-box-id]').length).toBe(1);
  });

  // A file dropped on the home page arrives as a handoff (draftStore.saveHandoff)
  // rather than as a draft, precisely so it cannot overwrite one. The tool resolves
  // it *before* loadDraft rather than racing it, so which document opens is decided
  // by intent and not by which IndexedDB read happened to settle first.
  it('PdfSignTool: a pending home-page handoff opens ahead of the saved draft', async () => {
    await seedDraft('draft-old.pdf', []);
    expect(await saveHandoff('sign', {
      fileName: 'dropped-on-home.pdf',
      fileType: 'application/pdf',
      fileBytes: (await buildPdf([{ lines: ['home drop'] }])).slice().buffer
    })).toBe(true);

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    // The draft is in the real store the whole time: it must lose, and it must lose by the order of the
    // checks rather than because the handoff happened to be quicker.
    await waitUntil(() => announced(container!, 'p').includes('dropped-on-home.pdf'));
    await act(async () => { await drainPromises(); });

    const announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('dropped-on-home.pdf');
    expect(announcement.textContent).not.toContain('draft-old.pdf');
  });

  it('PdfSignTool: falls back to the draft when there is no handoff waiting', async () => {
    await seedDraft('draft-old.pdf', []);
    await holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    await resolveRestore();
    await waitUntil(() => announced(container!, 'p').includes('Restored your last draft of "draft-old.pdf"'));

    expect(peekHandoff).toHaveBeenCalledWith('sign');
    const announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('Restored your last draft of "draft-old.pdf"');
  });
});
