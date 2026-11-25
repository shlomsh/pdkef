import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { cacheRecentFile, commitHandoff, peekHandoff, readRecentFiles, saveHandoff } from '../drafts/draftStore.ts';
import { takeArrival, resetFileArrivalForTests } from './fileArrival.ts';
import { filesFromHandoff, markHandoffArrival, useHandoffFilesIntake, useHandoffIntake } from './useHandoffIntake.ts';

// The real store runs on fake-indexeddb, with the real settle and recents behind it. The spy lets a test see
// which reads happened and await their results; two tests force one write to be held open or to fail.
vi.mock('../drafts/draftStore.ts', { spy: true });

// No @testing-library/preact-hooks in this repo, so a tiny harness component
// runs the hook under test - the same pattern useObjectUrls.test.jsx uses for
// a hook instead of markup.
function Harness({ tool, onFile }: { tool: string; onFile: (file: File, from?: string) => void }) {
  useHandoffIntake(tool, onFile);
  return null;
}

function FilesHarness({ tool, onFiles }: { tool: string; onFiles: (files: File[], from?: string) => void }) {
  useHandoffFilesIntake(tool, onFiles);
  return null;
}

const buf = (n: number) => new Uint8Array(n).buffer;

// The callback a hook is handed, as a plain function that records its calls and resolves a promise when the hook
// hands it the file: tests await that, not a timer.
function arrivalSpy<Args extends unknown[]>(impl: (...args: Args) => void = () => {}) {
  const arrived = Promise.withResolvers<void>();
  const calls: Args[] = [];
  const spy = (...args: Args) => {
    calls.push(args);
    impl(...args);
    arrived.resolve();
  };
  spy.calls = calls;
  return [spy, arrived.promise] as [typeof spy, Promise<void>];
}

// A real file's bytes, so what the store holds and what the hook hands over can be compared.
const bytes = (text = 'hand-off') => new TextEncoder().encode(text).buffer;

// The hook has read the store once its read has settled: a signal that the chain started. A test that expects
// nothing to happen awaits it, then drains the few promise hops that carry its result on.
const peeked = () => act(async () => { await vi.mocked(peekHandoff).mock.results[0].value; });

// A clean store and clean page state for each test.
function freshPage() {
  indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-handoff-pending');
  vi.mocked(peekHandoff).mockClear();
  vi.mocked(commitHandoff).mockClear();
  vi.mocked(cacheRecentFile).mockClear();
}

// Lets the promise chain peek -> settleHandoff -> release finish when nothing is handed over.
const drain = () => act(async () => { await drainPromises(); });

describe('filesFromHandoff', () => {
  it.each([
    ['null', null, []],
    ['a record with no bytes', { fileName: 'a.pdf' }, []],
    ['an empty files list', { files: [] }, []],
    ['a files list with an entry missing bytes', { files: [{ fileName: 'a.pdf', fileBytes: buf(1) }, { fileName: 'b.pdf' }] }, []],
  ])('returns [] for %s', (_label, record, expected) => {
    expect(filesFromHandoff(record)).toEqual(expected);
  });

  it('turns a single record into one File, defaulting the type to application/pdf', () => {
    const [file, ...rest] = filesFromHandoff({ fileName: 'a.pdf', fileBytes: buf(3) });
    expect(rest).toEqual([]);
    expect(file).toBeInstanceOf(File);
    expect([file.name, file.type, file.size]).toEqual(['a.pdf', 'application/pdf', 3]);
  });

  it('turns a multi record into every File in order, keeping each type', () => {
    const files = filesFromHandoff({
      files: [
        { fileName: 'a.pdf', fileBytes: buf(1) },
        { fileName: 'b.png', fileType: 'image/png', fileBytes: buf(2) },
      ],
    });
    expect(files.map((f) => [f.name, f.type, f.size])).toEqual([
      ['a.pdf', 'application/pdf', 1],
      ['b.png', 'image/png', 2],
    ]);
  });
});

describe('useHandoffFilesIntake', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    freshPage();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  // `arrived` (from arrivalSpy) is awaited when the test expects the callback; without it the chain is drained.
  const settle = async (ui: ComponentChild, arrived?: Promise<void>) => {
    await act(async () => {
      render(ui, container);
    });
    if (arrived) await act(async () => { await arrived; });
    else {
      await peeked();
      await drain();
    }
  };

  it('hands onFiles every file of a multi record in order, with from', async () => {
    await saveHandoff('merge', {
      from: 'home',
      files: [{ fileName: 'a.pdf', fileBytes: buf(1) }, { fileName: 'b.pdf', fileBytes: buf(2) }],
    });
    const [onFiles, arrived] = arrivalSpy<[File[], string?]>();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />, arrived);
    expect(onFiles.calls).toHaveLength(1);
    expect(onFiles.calls[0][0].map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(onFiles.calls[0][1]).toBe('home');
  });

  it('hands onFiles [file] for a single record', async () => {
    await saveHandoff('merge', { fileName: 'a.pdf', fileBytes: buf(1) });
    const [onFiles, arrived] = arrivalSpy<[File[], string?]>();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />, arrived);
    expect(onFiles.calls[0][0].map((f) => f.name)).toEqual(['a.pdf']);
  });

  it('does not call onFiles when there is nothing pending or the record is invalid', async () => {
    const onFiles = vi.fn();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('a stale marker (nothing stored) clears the key and the html attribute at once', async () => {
    sessionStorage.setItem('pdkef:handoff-pending:merge', '1');
    document.documentElement.setAttribute('data-handoff-pending', '1');
    await settle(<FilesHarness tool="merge" onFiles={vi.fn()} />);
    expect(sessionStorage.getItem('pdkef:handoff-pending:merge')).toBeNull();
    expect(document.documentElement.hasAttribute('data-handoff-pending')).toBe(false);
  });

  it('a consumed hand-off clears the key now and keeps the attribute until the tool shows its file', async () => {
    await saveHandoff('merge', { fileName: 'a.pdf', fileBytes: buf(1) });
    expect(sessionStorage.getItem('pdkef:handoff-pending:merge')).toBe('1');
    document.documentElement.setAttribute('data-handoff-pending', '1');
    const [onFiles, arrived] = arrivalSpy<[File[], string?]>();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />, arrived);
    expect(onFiles.calls).toHaveLength(1);
    expect(sessionStorage.getItem('pdkef:handoff-pending:merge')).toBeNull();
    expect(document.documentElement.hasAttribute('data-handoff-pending')).toBe(true);
    const card = document.createElement('div');
    card.setAttribute('data-tool-loaded', '');
    document.body.append(card);
    await waitUntil(() => !document.documentElement.hasAttribute('data-handoff-pending'));
    expect(document.documentElement.hasAttribute('data-handoff-pending')).toBe(false);
    card.remove();
  });

  it('releases the held-back page when the result resolves after unmount', async () => {
    await saveHandoff('merge', { files: [{ fileName: 'late.pdf', fileBytes: buf(1) }] });
    document.documentElement.setAttribute('data-handoff-pending', '1');
    // Unmounted before the store's read has settled: the read really is still in flight here.
    act(() => { render(<FilesHarness tool="merge" onFiles={vi.fn()} />, container); });
    act(() => { render(null, container); });
    await waitUntil(() => !document.documentElement.hasAttribute('data-handoff-pending'));
    expect(document.documentElement.hasAttribute('data-handoff-pending')).toBe(false);
  });

  it('drops a result that resolves after unmount', async () => {
    await saveHandoff('merge', { files: [{ fileName: 'late.pdf', fileBytes: buf(1) }] });
    // The held-back page is released only once the chain has passed its cancelled check: the signal to wait for.
    document.documentElement.setAttribute('data-handoff-pending', '1');
    const onFiles = vi.fn();
    act(() => { render(<FilesHarness tool="merge" onFiles={onFiles} />, container); });
    act(() => { render(null, container); });
    await waitUntil(() => !document.documentElement.hasAttribute('data-handoff-pending'));
    await drain();
    expect(onFiles).not.toHaveBeenCalled();
  });
});

describe('useHandoffIntake', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    freshPage();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  it('resolves with a record and hands onFile a File matching its name/type/size', async () => {
    await saveHandoff('compress', {
      fileName: 'merged.pdf',
      fileType: 'application/pdf',
      fileBytes: new Uint8Array([1, 2, 3, 4]).buffer,
    });

    const [onFile, arrived] = arrivalSpy<[File, string?]>();
    await act(async () => {
      render(<Harness tool="compress" onFile={onFile} />, container);
    });
    await act(async () => { await arrived; });

    expect(onFile.calls).toHaveLength(1);
    const file = onFile.calls[0][0];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('merged.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(4);
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });

  it('hands onFile the first file of a multi record, with from', async () => {
    await saveHandoff('merge', {
      from: 'home',
      files: [{ fileName: 'first.pdf', fileBytes: buf(1) }, { fileName: 'second.pdf', fileBytes: buf(2) }],
    });
    const [onFile, arrived] = arrivalSpy<[File, string?]>();
    await act(async () => {
      render(<Harness tool="merge" onFile={onFile} />, container);
    });
    await act(async () => { await arrived; });
    expect(onFile.calls).toHaveLength(1);
    expect(onFile.calls[0][0].name).toBe('first.pdf');
    expect(onFile.calls[0][1]).toBe('home');
  });

  it('passes on which tool sent the file, when the record says', async () => {
    await saveHandoff('unlock', { fileName: 'a.pdf', fileBytes: new Uint8Array([1]).buffer, from: 'redact' });
    const [onFile, arrived] = arrivalSpy<[File, string?]>();
    await act(async () => {
      render(<Harness tool="unlock" onFile={onFile} />, container);
    });
    await act(async () => { await arrived; });
    expect(onFile.calls[0][1]).toBe('redact');
  });

  it.each([['home'], ['open'], ['drive']])('marks the %s page as the sender', (from) => {
    resetFileArrivalForTests();
    markHandoffArrival(from);
    expect(takeArrival()).toEqual({ source: 'handoff', from });
  });

  it('marks no sender it does not know', () => {
    resetFileArrivalForTests();
    markHandoffArrival('elsewhere');
    expect(takeArrival()).toEqual({ source: 'handoff' });
  });

  it('defaults to application/pdf when the record carries no fileType', async () => {
    await saveHandoff('split', { fileName: 'merged.pdf', fileBytes: new Uint8Array([1, 2]).buffer });

    const [onFile, arrived] = arrivalSpy<[File, string?]>();
    await act(async () => {
      render(<Harness tool="split" onFile={onFile} />, container);
    });
    await act(async () => { await arrived; });

    expect(onFile.calls[0][0].type).toBe('application/pdf');
  });

  it('does not call onFile when there is no pending hand-off', async () => {
    const onFile = vi.fn();
    await act(async () => {
      render(<Harness tool="compress" onFile={onFile} />, container);
    });
    await peeked();
    await drain();

    expect(onFile).not.toHaveBeenCalled();
  });

  it('drops a late result if the component unmounts before the promise resolves', async () => {
    await saveHandoff('compress', { fileName: 'late.pdf', fileType: 'application/pdf', fileBytes: new ArrayBuffer(1) });
    // The held-back page is released only once the chain has passed its cancelled check: the signal to wait for.
    document.documentElement.setAttribute('data-handoff-pending', '1');

    const onFile = vi.fn();
    act(() => {
      render(<Harness tool="compress" onFile={onFile} />, container);
    });

    // Unmount before the store's read settles.
    act(() => {
      render(null, container);
    });

    await waitUntil(() => !document.documentElement.hasAttribute('data-handoff-pending'));
    await drain();

    expect(onFile).not.toHaveBeenCalled();
  });

  it('calls takeHandoff with the tool name exactly once across re-renders', async () => {
    const onFileA = vi.fn();
    await act(async () => {
      render(<Harness tool="split" onFile={onFileA} />, container);
    });
    await peeked();
    await drain();

    // Re-render with a new onFile identity (as a component whose
    // handleFilesAdded closes over per-render state would pass) - the [tool]
    // dependency must not re-run the effect just because the callback
    // reference changed.
    const onFileB = vi.fn();
    await act(async () => {
      render(<Harness tool="split" onFile={onFileB} />, container);
    });
    await drain();

    expect(peekHandoff).toHaveBeenCalledTimes(1);
    expect(peekHandoff).toHaveBeenCalledWith('split');
  });

  it.each([
    ['/compress-image/', 'doc.pdf', 'application/pdf', false],
    ['/compress-image/', 'me.jpg', 'image/jpeg', true],
    ['/compress/', 'me.jpg', 'image/jpeg', false],
    ['/compress/', 'doc.pdf', 'application/pdf', true],
  ])('on %s asks the store only for a hand-off that fits the page: %s (%s) -> %s', async (path, fileName, fileType, fits) => {
    history.pushState({}, '', path);
    await saveHandoff('compress', { fileName, fileType, fileBytes: bytes('%PDF-1.7 fits') });
    const [onFile, arrived] = arrivalSpy<[File, string?]>();
    await act(async () => {
      render(<Harness tool="compress" onFile={onFile} />, container);
    });
    expect(peekHandoff).toHaveBeenCalledWith('compress', expect.any(Function));
    if (fits) {
      await act(async () => { await arrived; });
      expect(onFile.calls[0][0].name).toBe(fileName);
    } else {
      await peeked();
      await drain();
      // Left alone: the page it was meant for will still find it.
      expect(onFile.calls).toHaveLength(0);
      expect((await peekHandoff('compress'))?.fileName).toBe(fileName);
    }
    history.pushState({}, '', '/');
  });

  it('puts no restriction on a tool that takes whatever it is handed', async () => {
    history.pushState({}, '', '/sign/');
    await saveHandoff('sign', { fileName: 'a.pdf', fileBytes: bytes('%PDF-1.7 sign') });
    const [onFile, arrived] = arrivalSpy<[File, string?]>();
    await act(async () => {
      render(<Harness tool="sign" onFile={onFile} />, container);
    });
    await act(async () => { await arrived; });
    expect(peekHandoff).toHaveBeenCalledWith('sign');
    expect(onFile.calls[0][0].name).toBe('a.pdf');
    history.pushState({}, '', '/');
  });
});

describe('hand-off arrival mark (DEBT-58)', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    freshPage();
    resetFileArrivalForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });
  const run = async (ui: ComponentChild, arrived: Promise<void>) => {
    await act(async () => {
      render(ui, container);
    });
    await act(async () => { await arrived; });
  };

  it('marks a hand-off from an analytics tool with that tool, before the callback runs', async () => {
    await saveHandoff('unlock', { from: 'redact', fileName: 'a.pdf', fileBytes: buf(1) });
    let seen: ReturnType<typeof takeArrival>;
    const [onFile, arrived] = arrivalSpy<[File, string?]>(() => { seen = takeArrival(); });
    await run(<Harness tool="unlock" onFile={onFile} />, arrived);
    expect(seen).toEqual({ source: 'handoff', from: 'redact' });
  });

  it('marks a hand-off from an unknown sender without a from', async () => {
    await saveHandoff('merge', { from: 'elsewhere', files: [{ fileName: 'a.pdf', fileBytes: buf(1) }] });
    let seen: ReturnType<typeof takeArrival>;
    const [onFiles, arrived] = arrivalSpy<[File[], string?]>(() => { seen = takeArrival(); });
    await run(<FilesHarness tool="merge" onFiles={onFiles} />, arrived);
    expect(seen).toEqual({ source: 'handoff' });
  });
});

describe('hand-off survives a reload before it is stored (2026-11-12)', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    freshPage();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });
  it('keeps the record until the PDF is in recents, then deletes it', async () => {
    await saveHandoff('sign', { fileName: 'a.pdf', fileBytes: bytes('%PDF-1.7 keep') });
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBe('1');
    const [onFiles, arrived] = arrivalSpy<[File[], string?]>();
    const cacheStarted = Promise.withResolvers<void>();
    const releaseWrite = Promise.withResolvers<void>();
    const real = await vi.importActual<typeof import('../drafts/draftStore.ts')>('../drafts/draftStore.ts');
    // Forced: hold the recents write open, then let the real one run, so the window a reload lands in can be observed.
    vi.mocked(cacheRecentFile).mockImplementationOnce(async (...args) => {
      cacheStarted.resolve();
      await releaseWrite.promise;
      return real.cacheRecentFile(...args);
    });
    await act(async () => {
      render(<FilesHarness tool="sign" onFiles={onFiles} />, container);
    });
    await act(async () => { await cacheStarted.promise; });
    // The write has started but not finished: this is the window a reload lands in.
    expect(cacheRecentFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cacheRecentFile).mock.calls[0][0]).toBe('sign');
    expect((await peekHandoff('sign'))?.fileName).toBe('a.pdf');
    expect(readRecentFiles()).toEqual([]);
    expect(commitHandoff).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBe('1');
    await act(async () => { releaseWrite.resolve(); await arrived; });
    expect(commitHandoff).toHaveBeenCalledWith('sign');
    expect(await peekHandoff('sign')).toBeNull();
    expect(readRecentFiles().map((e) => e.fileName)).toEqual(['a.pdf']);
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBeNull();
    expect(onFiles.calls).toHaveLength(1);
  });

  it('still commits when the recents write fails, so a stale record is not re-opened every visit', async () => {
    await saveHandoff('sign', { fileName: 'a.pdf', fileBytes: bytes('%PDF-1.7 quota') });
    vi.mocked(cacheRecentFile).mockRejectedValueOnce(new Error('quota')); // forced: the real write does not fail here
    const [onFiles, arrived] = arrivalSpy<[File[], string?]>();
    await act(async () => {
      render(<FilesHarness tool="sign" onFiles={onFiles} />, container);
    });
    await act(async () => { await arrived; });
    expect(commitHandoff).toHaveBeenCalledTimes(1);
    expect(await peekHandoff('sign')).toBeNull();
    expect(onFiles.calls).toHaveLength(1);
  });
});
