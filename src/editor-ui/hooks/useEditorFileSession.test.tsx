import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { useEditorFileSession, type EditorFileSessionOptions } from './useEditorFileSession.ts';
import { loadPdf as loadEditorPdf } from '#editor/workspace/loadPdf.ts';
import { useEditorDraftPersistence } from '#editor/workspace/useEditorDraftPersistence.ts';
import { cacheRecentFile } from '#lib/drafts/draftStore.ts';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { uniqueId } from '#editor/model/ids.ts';
import { buildPdf, legacyPdfjs } from '../../test/support/redactCheckPdfs.test-helper.ts';

// Spy-through: the real loader, draft persistence and recents store run (on fake-indexeddb, real pdf.js);
// the spies show what they were handed.
vi.mock('#editor/workspace/loadPdf.ts', { spy: true });
vi.mock('#editor/workspace/useEditorDraftPersistence.ts', { spy: true });
vi.mock('#lib/drafts/draftStore.ts', { spy: true });
// The shipped pdf.js loader points at a browser Worker, which node does not have. Forced: the same pdf.js,
// its legacy (node) build.
vi.mock('#lib/pdf/loadPdfjs.js', { spy: true });

declare const process: { cwd(): string };
// jsdom resolves the helper's worker URL to http; point pdf.js at the legacy build's own file.
const workerUrl = `file://${process.cwd()}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`;
Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', { get: () => workerUrl, set() {}, configurable: true });

const mockedLoad = vi.mocked(loadEditorPdf);
const mockedDraft = vi.mocked(useEditorDraftPersistence);

type Session = ReturnType<typeof useEditorFileSession>;

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) act(() => render(null, host!));
  host?.remove();
  host = null;
  delete (window as any).launchQueue;
});
let plainBytes: Uint8Array;
beforeAll(async () => { plainBytes = await buildPdf([{ lines: ['hello'] }]); });
beforeEach(() => {
  indexedDB = new IDBFactory();
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs()); // forced: the node build
});

/** jsdom's File has no arrayBuffer(); this reads the file's real bytes the way the browser's does. */
function pdf(name = 'a.pdf', bytes: Uint8Array = plainBytes) {
  const file = new File([bytes as BlobPart], name, { type: 'application/pdf' });
  (file as any).arrayBuffer = () => new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
  return file;
}
const protectedFile = (name: string) => pdf(`${name}.pdf`, new Uint8Array(readFileSync(`${process.cwd()}/src/lib/__fixtures__/encrypted/${name}.pdf`)));

function mount(overrides: Partial<EditorFileSessionOptions<any>> = {}) {
  const spies = {
    setLoadStatus: vi.fn(),
    setAnnouncement: vi.fn(),
    onNeedsUnlock: vi.fn(),
    initialize: vi.fn(),
    onDocument: vi.fn(),
  };
  const ref = { current: null as Session | null };
  function Probe() {
    ref.current = useEditorFileSession<any>({
      tool: 'redact',
      file: null,
      pdfDocument: null,
      status: 'idle',
      messages: {
        invalidPdf: 'Choose a PDF file.',
        needsPassword: 'This PDF has a password. Unlock opens it.',
        ownerRestricted: 'This PDF is protected. Unlock takes the protection off.',
      },
      draft: { elements: [], actionHistory: [], isDirty: false, isElement: (_v: unknown): _v is any => true },
      ...spies,
      ...overrides,
    });
    return null;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Probe />, host!));
  return { spies, session: () => ref.current! };
}

describe('useEditorFileSession', () => {
  it('opens the first PDF: claims the slot at once, resets the tool, remembers the bytes and the recent', async () => {
    const { spies, session } = mount();
    const pending = session().handleFilesAdded([new File(['x'], 'notes.txt'), pdf('one.pdf'), pdf('two.pdf')]);
    expect(session().loadStartedRef.current).toBe(true);
    await act(async () => { await pending; });

    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(mockedLoad.mock.calls[0][0].file.name).toBe('one.pdf');
    expect(spies.initialize).toHaveBeenCalledTimes(1);
    expect(session().fileBytesRef.current?.byteLength).toBe(plainBytes.byteLength);
    expect(cacheRecentFile).toHaveBeenCalledWith('redact', expect.objectContaining({ fileName: 'one.pdf', fileType: 'application/pdf' }));
    expect(spies.setLoadStatus).toHaveBeenLastCalledWith('editing');
  });

  it('says so, and loads nothing, when no picked file is a PDF', async () => {
    const { spies, session } = mount();
    await act(async () => { await session().handleFilesAdded([new File(['x'], 'notes.txt')]); });
    expect(mockedLoad).not.toHaveBeenCalled();
    expect(spies.setAnnouncement).toHaveBeenCalledWith('Choose a PDF file.');
    expect(session().loadStartedRef.current).toBe(false);
  });

  it('lets a tool word the invalid-file and protected-file announcements', async () => {
    const { spies, session } = mount({ messages: { invalidPdf: 'Bad', needsPassword: 'Pw', ownerRestricted: 'Owner' } });
    await act(async () => { await session().handleFilesAdded([new File(['x'], 'n.txt')]); });
    expect(spies.setAnnouncement).toHaveBeenCalledWith('Bad');

    await act(async () => { await session().handleFilesAdded([protectedFile('needs-password')]); });
    expect(spies.onNeedsUnlock).toHaveBeenCalledWith('needs-password');
    expect(spies.setAnnouncement).toHaveBeenCalledWith('Pw');
    await act(async () => { await session().handleFilesAdded([protectedFile('owner-only')]); });
    expect(spies.setAnnouncement).toHaveBeenCalledWith('Owner');
  });

  it('lets the tool prepare a fresh file before anything sees it: its bytes and its first elements', async () => {
    // Another real PDF, as a tool that rewrites the file would hand back.
    const other = await buildPdf([{ lines: ['prepared'] }]);
    const prepared = other.buffer.slice(other.byteOffset, other.byteOffset + other.byteLength) as ArrayBuffer;
    let prepareCalls = 0;
    const prepareFile = async () => { prepareCalls += 1; return { bytes: prepared, elements: [{ id: 'imported-1' }] }; };
    const { spies, session } = mount({ prepareFile });
    await act(async () => { await session().handleFilesAdded([pdf()]); });
    expect(prepareCalls).toBe(1);
    expect(mockedLoad.mock.calls[0][0].bytes).toBe(prepared);
    expect(spies.initialize).toHaveBeenCalledWith(expect.objectContaining({ bytes: prepared, preset: { elements: [{ id: 'imported-1' }], actionHistory: [] } }));
    expect(session().fileBytesRef.current).toBe(prepared);
    expect(cacheRecentFile).toHaveBeenCalledWith('redact', expect.objectContaining({ fileBytes: prepared }));
  });

  it('never prepares a file that comes with saved work', async () => {
    let prepareCalls = 0;
    const prepareFile = async () => { prepareCalls += 1; return { bytes: new ArrayBuffer(1), elements: [] }; };
    mount({ prepareFile });
    const options = mockedDraft.mock.calls[0][0];
    await act(async () => {
      await options.loadPdf(pdf(), plainBytes.slice().buffer, { elements: [{ id: 'el-1' }], actionHistory: [] } as any, true);
    });
    expect(prepareCalls).toBe(0);
  });

  it('a newer pick wins over an older one still being prepared', async () => {
    let releaseFirst: () => void = () => {};
    // Each pick's prepare is its own promise: the first is held, the second answers at once.
    let picks = 0;
    const prepareFile = (bytes: ArrayBuffer) => {
      picks += 1;
      if (picks > 1) return Promise.resolve({ bytes, elements: [] });
      return new Promise<{ bytes: ArrayBuffer; elements: never[] }>((resolve) => { releaseFirst = () => resolve({ bytes, elements: [] }); });
    };
    const { session } = mount({ prepareFile });
    const first = session().handleFilesAdded([pdf('old.pdf')]);
    await act(async () => { await session().handleFilesAdded([pdf('new.pdf')]); });
    releaseFirst();
    await act(async () => { await first; });
    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(mockedLoad.mock.calls[0][0].file.name).toBe('new.pdf');
  });

  it('seeds the unique ids from a restored draft so a new mark never reuses one', async () => {
    const { session } = mount();
    const options = mockedDraft.mock.calls[0][0];
    await act(async () => {
      await options.loadPdf(pdf(), plainBytes.slice().buffer, { elements: [{ id: 'el-41' }], actionHistory: [] } as any, true);
    });
    expect(uniqueId()).toBe('el-42');
    expect(mockedLoad.mock.calls[0][0].restored).toBe(true);
    expect(session().fileBytesRef.current).not.toBeNull();
  });

  it('hands draft persistence the tool and the document state it saves', () => {
    const elements = [{ id: 'el-1' }];
    mount({
      tool: 'sign',
      status: 'editing',
      draft: { elements, actionHistory: [], carried: { color: '#000' } as any, details: { a: 1 } as any, isDirty: true, isElement: (_v: unknown): _v is any => true },
    });
    const options = mockedDraft.mock.calls.at(-1)![0];
    expect(options).toMatchObject({ tool: 'sign', status: 'editing', elements, isDirty: true, details: { a: 1 }, carried: { color: '#000' } });
  });

  it('lets a draft restore see that a manual pick has claimed the load slot', async () => {
    const { session } = mount();
    const slot = mockedDraft.mock.calls.at(-1)![0].loadStartedRef;
    expect(slot.current).toBe(false);
    const pending = session().handleFilesAdded([pdf()]);
    expect(slot.current).toBe(true);
    await act(async () => { await pending; });
  });

  it('opens a file the installed app was launched with (launchQueue)', async () => {
    let consumer!: (params: { files?: any[] }) => Promise<void>;
    (window as any).launchQueue = { setConsumer: (fn: typeof consumer) => { consumer = fn; } };
    mount();
    await act(async () => { await consumer({ files: [{ getFile: async () => pdf('launched.pdf') }] }); });
    expect(mockedLoad.mock.calls[0][0].file.name).toBe('launched.pdf');
  });

  it('ignores a launch once a file is already opening, and an empty one', async () => {
    let consumer!: (params: { files?: any[] }) => Promise<void>;
    (window as any).launchQueue = { setConsumer: (fn: typeof consumer) => { consumer = fn; } };
    const { session } = mount();
    await act(async () => { await consumer({ files: [] }); await consumer({}); });
    expect(mockedLoad).not.toHaveBeenCalled();
    session().loadStartedRef.current = true;
    await act(async () => { await consumer({ files: [{ getFile: async () => pdf() }] }); });
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('is fine without a launchQueue', () => {
    expect(() => mount()).not.toThrow();
  });

  it('cancels the load in flight when the editor unmounts', async () => {
    const { session } = mount();
    const cancel = vi.fn();
    session().loadControllerRef.current = { cancel };
    const idBefore = session().loadIdRef.current;
    act(() => render(null, host!));
    expect(cancel).toHaveBeenCalled();
    expect(session().loadIdRef.current).toBe(idBefore + 1);
  });
});
