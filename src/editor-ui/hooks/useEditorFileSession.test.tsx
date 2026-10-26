import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorFileSession, type EditorFileSessionOptions } from './useEditorFileSession.ts';
import { loadPdf as loadEditorPdf, type PdfLoadOptions } from '../../editor/workspace/loadPdf.ts';
import { useEditorDraftPersistence } from '../../editor/workspace/useEditorDraftPersistence.ts';
import { cacheRecentFile } from '../../lib/drafts/draftStore.js';
import { uniqueId } from '../../editor/model/ids.ts';

vi.mock('../../editor/workspace/loadPdf.ts', () => ({ loadPdf: vi.fn() }));
vi.mock('../../editor/workspace/useEditorDraftPersistence.ts', () => ({
  useEditorDraftPersistence: vi.fn(() => ({ clearDraft: vi.fn(), isRestoring: false, draftSaveState: 'idle' })),
}));
vi.mock('../../lib/drafts/draftStore.js', () => ({ cacheRecentFile: vi.fn() }));

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
beforeEach(() => {
  vi.clearAllMocks();
  mockedLoad.mockImplementation(async (options: PdfLoadOptions) => {
    options.initialize();
    options.setStatus('loading');
    await options.onDocument({ numPages: 2 } as any, () => true);
    options.setStatus('editing');
  });
});

function pdf(name = 'a.pdf') {
  const file = new File(['%PDF'], name, { type: 'application/pdf' });
  (file as any).arrayBuffer = async () => new ArrayBuffer(4);
  return file;
}

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
      draft: { elements: [], actionHistory: [], isDirty: false, isElement: (v: unknown): v is any => true },
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
    expect(session().fileBytesRef.current?.byteLength).toBe(4);
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

    mockedLoad.mockImplementationOnce(async (options: PdfLoadOptions) => { options.onNeedsUnlock?.('needs-password'); });
    await act(async () => { await session().handleFilesAdded([pdf()]); });
    expect(spies.onNeedsUnlock).toHaveBeenCalledWith('needs-password');
    expect(spies.setAnnouncement).toHaveBeenCalledWith('Pw');
    mockedLoad.mockImplementationOnce(async (options: PdfLoadOptions) => { options.onNeedsUnlock?.('owner-restricted'); });
    await act(async () => { await session().handleFilesAdded([pdf()]); });
    expect(spies.setAnnouncement).toHaveBeenCalledWith('Owner');
  });

  it('English defaults for a protected file', async () => {
    const { spies, session } = mount();
    mockedLoad.mockImplementationOnce(async (options: PdfLoadOptions) => { options.onNeedsUnlock?.('needs-password'); });
    await act(async () => { await session().handleFilesAdded([pdf()]); });
    expect(spies.setAnnouncement).toHaveBeenCalledWith('This PDF has a password. Unlock opens it.');
  });

  it('seeds the unique ids from a restored draft so a new mark never reuses one', async () => {
    const { session } = mount();
    const options = mockedDraft.mock.calls[0][0];
    await act(async () => {
      await options.loadPdf(pdf(), new ArrayBuffer(4), { elements: [{ id: 'el-41' }], actionHistory: [] } as any, true);
    });
    expect(uniqueId()).toBe('el-42');
    expect(mockedLoad.mock.calls[0][0].restored).toBe(true);
    expect(session().fileBytesRef.current).not.toBeNull();
  });

  it('wires draft persistence to the tool, its state and the same load slot', () => {
    const elements = [{ id: 'el-1' }];
    const { session } = mount({
      tool: 'sign',
      status: 'editing',
      draft: { elements, actionHistory: [], carried: { color: '#000' } as any, details: { a: 1 } as any, isDirty: true, isElement: (v: unknown): v is any => true },
    });
    const options = mockedDraft.mock.calls.at(-1)![0];
    expect(options).toMatchObject({ tool: 'sign', status: 'editing', elements, isDirty: true, details: { a: 1 }, carried: { color: '#000' } });
    expect(options.loadStartedRef).toBe(session().loadStartedRef);
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
