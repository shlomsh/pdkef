import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import PdfSignTool from '../../tools/sign/PdfSignTool.tsx';
import PdfRedactTool from '../../tools/redact/PdfRedactTool.tsx';
import { cacheRecentFile, hasDraftHint, loadDraft, peekHandoff, saveDraft, saveHandoff } from '#lib/drafts/draftStore.ts';
import { drainPromises } from '../support/drainPromises.ts';
import { waitUntil } from '../support/waitUntil.ts';
import { setInputFiles } from '../support/setInputFiles.js';


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
// hand-off the home page parked. Two forced lines on the spy keep the race controllable: loadDraft reads the
// real record at once but answers only when the test opens a gate (a slow IndexedDB read), and hasDraftHint
// says false so every scenario starts in the empty state, as before.

function makePdfFile(name: string) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// The draft an earlier session left, written by the real store. Its bytes differ from a fresh pick's so
// the two are different entries.
async function seedDraft(fileName: string, elements: unknown[]) {
  const saved = await saveDraft('sign', {
    fileName,
    fileType: 'application/pdf',
    fileBytes: new TextEncoder().encode('%PDF-1.4 old draft').buffer,
    elements,
    extra: {}
  });
  expect(saved).toBe(true);
}
async function seedRedactDraft(fileName: string, boxes: unknown[]) {
  const saved = await saveDraft('redact', {
    fileName,
    fileType: 'application/pdf',
    fileBytes: new TextEncoder().encode('%PDF-1.4 old draft').buffer,
    elements: boxes,
    extra: {}
  });
  expect(saved).toBe(true);
}

let gate: ReturnType<typeof deferred>;

vi.mock('#lib/drafts/draftStore.ts', { spy: true });

// Forced: a restored draft's bytes come out of fake-indexeddb as a Node-realm ArrayBuffer, which the shipped pdf.js in jsdom rejects ('Invalid PDF binary data', tried with real pdf-lib bytes)
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPermissions: vi.fn(async () => null),
      getPage: vi.fn(() =>
        Promise.resolve({
          getViewport: () => ({ width: 612, height: 792 }),
          render: () => ({ promise: Promise.resolve() })
        })
      )
    })
  }))
}));

const announced = (container: HTMLElement, tag: 'p' | 'div') =>
  container.querySelector(`${tag}.sr-only[role="status"]`)?.textContent ?? '';

// The product awaits loadDraft() and then checks whether the restore was superseded. Our await on the
// same promise runs after its continuation (same promise, reactions in order), so by then the stale
// restore has either been dropped or has started applying; the drain carries the rest into the render.
let restoreResult: Promise<unknown> | undefined;
async function resolveRestore() {
  await act(async () => {
    gate.resolve(null);
    await restoreResult;
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

  // Forced: a held store would also hold the picked file's own save, so the draft read would not be the stale one the race needs; the restore read starts at once on the real store but answers when the gate opens.
  const holdRestore = () => {
    gate = deferred();
    vi.mocked(loadDraft).mockImplementationOnce(async (name) => {
      const real = await vi.importActual<typeof import('#lib/drafts/draftStore.ts')>('#lib/drafts/draftStore.ts');
      const record = real.loadDraft(name);
      restoreResult = record;
      await gate.promise;
      return record;
    });
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

  beforeEach(() => {
    indexedDB = new IDBFactory();
    localStorage.clear();
    vi.mocked(loadDraft).mockReset();
    // Forced: a real hint (the seeded pointer) opens the tool in its restoring state, with no file input to pick with
    vi.mocked(hasDraftHint).mockReturnValue(false);
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
    holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    // Restore's loadDraft() is now in flight and unresolved.

    await pickFile(container, makePdfFile('fresh-user-pick.pdf'));
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
    holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    await act(async () => {
      gate.resolve(null);
    });
    await waitUntil(() => announced(container!, 'p').includes('Restored your last draft of "draft-old.pdf"'));

    const announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('Restored your last draft of "draft-old.pdf"');
  });

  it('PdfRedactTool: a manual pick that finishes before a slow restore resolves is not clobbered by the stale draft', async () => {
    await seedRedactDraft('draft-old.pdf', [
      { id: 'stale-1', pageIndex: 0, left: 5, top: 5, width: 10, height: 10, style: 'blackout' }
    ]);
    holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container!);
    });

    await pickFile(container, makePdfFile('fresh-user-pick.pdf'));
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
    holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container!);
    });

    await act(async () => {
      gate.resolve(null);
    });
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
      fileBytes: new TextEncoder().encode('%PDF-1.4').buffer
    })).toBe(true);
    holdRestore();

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    // Let the draft resolve too: it must lose, and it must lose deterministically
    // rather than because the handoff happened to be quicker.
    await resolveRestore();
    await waitUntil(() => announced(container!, 'p').includes('dropped-on-home.pdf'));
    await resolveRestore();

    const announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('dropped-on-home.pdf');
    expect(announcement.textContent).not.toContain('draft-old.pdf');
  });

  it('PdfSignTool: falls back to the draft when there is no handoff waiting', async () => {
    await seedDraft('draft-old.pdf', []);
    holdRestore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    await act(async () => {
      gate.resolve(null);
    });
    await waitUntil(() => announced(container!, 'p').includes('Restored your last draft of "draft-old.pdf"'));

    expect(peekHandoff).toHaveBeenCalledWith('sign');
    const announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('Restored your last draft of "draft-old.pdf"');
  });
});
