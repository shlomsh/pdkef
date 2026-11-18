// @ts-nocheck - test harness, same convention as PdfCompressTool.test.tsx
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { takeArrival, resetFileArrivalForTests } from './fileArrival.ts';
import { filesFromHandoff, markHandoffArrival, useHandoffFilesIntake, useHandoffIntake } from './useHandoffIntake.ts';

const { takeHandoffMock, commitHandoffMock, cacheRecentFileMock } = vi.hoisted(() => ({
  takeHandoffMock: vi.fn(),
  commitHandoffMock: vi.fn(() => Promise.resolve()),
  cacheRecentFileMock: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../drafts/draftStore.ts', () => ({
  peekHandoff: takeHandoffMock,
  commitHandoff: commitHandoffMock,
  cacheRecentFile: cacheRecentFileMock,
}));

// No @testing-library/preact-hooks in this repo, so a tiny harness component
// runs the hook under test - the same pattern useObjectUrls.test.jsx uses for
// a hook instead of markup.
function Harness({ tool, onFile }) {
  useHandoffIntake(tool, onFile);
  return null;
}

function FilesHarness({ tool, onFiles }) {
  useHandoffFilesIntake(tool, onFiles);
  return null;
}

const buf = (n) => new Uint8Array(n).buffer;

// A spy that also resolves a promise when the hook hands it the file: tests await that, not a timer.
function arrivalSpy(impl = () => {}) {
  const arrived = Promise.withResolvers();
  const spy = vi.fn((...args) => {
    impl(...args);
    arrived.resolve();
  });
  return [spy, arrived.promise];
}

// Lets the promise chain peek -> settleHandoff -> release finish when nothing is handed over.
const drain = () => act(async () => { await drainPromises(); });

// The store commit is the last awaited step before the hook checks `cancelled`: a signal that the
// chain reached it. The test then drains the few promise hops that carry its result on.
function nextCommit() {
  const committed = Promise.withResolvers();
  commitHandoffMock.mockImplementationOnce(() => {
    committed.resolve();
    return Promise.resolve();
  });
  return committed.promise;
}

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
  let container;
  beforeEach(() => {
    takeHandoffMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  // `arrived` (from arrivalSpy) is awaited when the test expects the callback; without it the chain is drained.
  const settle = async (ui, arrived) => {
    await act(async () => {
      render(ui, container);
    });
    if (arrived) await act(async () => { await arrived; });
    else await drain();
  };

  it('hands onFiles every file of a multi record in order, with from', async () => {
    takeHandoffMock.mockResolvedValueOnce({
      from: 'home',
      files: [{ fileName: 'a.pdf', fileBytes: buf(1) }, { fileName: 'b.pdf', fileBytes: buf(2) }],
    });
    const [onFiles, arrived] = arrivalSpy();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />, arrived);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0].map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(onFiles.mock.calls[0][1]).toBe('home');
  });

  it('hands onFiles [file] for a single record', async () => {
    takeHandoffMock.mockResolvedValueOnce({ fileName: 'a.pdf', fileBytes: buf(1) });
    const [onFiles, arrived] = arrivalSpy();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />, arrived);
    expect(onFiles.mock.calls[0][0].map((f) => f.name)).toEqual(['a.pdf']);
  });

  it('does not call onFiles when there is nothing pending or the record is invalid', async () => {
    takeHandoffMock.mockResolvedValueOnce(null);
    const onFiles = vi.fn();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('a stale marker (nothing stored) clears the key and the html attribute at once', async () => {
    sessionStorage.setItem('pdkef:handoff-pending:merge', '1');
    document.documentElement.setAttribute('data-handoff-pending', '1');
    takeHandoffMock.mockResolvedValueOnce(null);
    await settle(<FilesHarness tool="merge" onFiles={vi.fn()} />);
    expect(sessionStorage.getItem('pdkef:handoff-pending:merge')).toBeNull();
    expect(document.documentElement.hasAttribute('data-handoff-pending')).toBe(false);
  });

  it('a consumed hand-off clears the key now and keeps the attribute until the tool shows its file', async () => {
    sessionStorage.setItem('pdkef:handoff-pending:merge', '1');
    document.documentElement.setAttribute('data-handoff-pending', '1');
    takeHandoffMock.mockResolvedValueOnce({ fileName: 'a.pdf', fileBytes: buf(1) });
    const [onFiles, arrived] = arrivalSpy();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />, arrived);
    expect(onFiles).toHaveBeenCalledTimes(1);
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
    document.documentElement.setAttribute('data-handoff-pending', '1');
    let resolveHandoff;
    takeHandoffMock.mockReturnValueOnce(new Promise((r) => { resolveHandoff = r; }));
    act(() => { render(<FilesHarness tool="merge" onFiles={vi.fn()} />, container); });
    act(() => { render(null, container); });
    await act(async () => {
      resolveHandoff({ files: [{ fileName: 'late.pdf', fileBytes: buf(1) }] });
    });
    await waitUntil(() => !document.documentElement.hasAttribute('data-handoff-pending'));
    expect(document.documentElement.hasAttribute('data-handoff-pending')).toBe(false);
  });

  it('drops a result that resolves after unmount', async () => {
    let resolveHandoff;
    takeHandoffMock.mockReturnValueOnce(new Promise((r) => { resolveHandoff = r; }));
    const onFiles = vi.fn();
    const committed = nextCommit();
    act(() => { render(<FilesHarness tool="merge" onFiles={onFiles} />, container); });
    act(() => { render(null, container); });
    await act(async () => {
      resolveHandoff({ files: [{ fileName: 'late.pdf', fileBytes: buf(1) }] });
      await committed;
    });
    await drain();
    expect(onFiles).not.toHaveBeenCalled();
  });
});

describe('useHandoffIntake', () => {
  let container;

  beforeEach(() => {
    takeHandoffMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = null;
  });

  it('resolves with a record and hands onFile a File matching its name/type/size', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    takeHandoffMock.mockResolvedValueOnce({
      fileName: 'merged.pdf',
      fileType: 'application/pdf',
      fileBytes: bytes,
    });

    const [onFile, arrived] = arrivalSpy();
    await act(async () => {
      render(<Harness tool="compress" onFile={onFile} />, container);
    });
    await act(async () => { await arrived; });

    expect(onFile).toHaveBeenCalledTimes(1);
    const file = onFile.mock.calls[0][0];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('merged.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(4);
  });

  it('hands onFile the first file of a multi record, with from', async () => {
    takeHandoffMock.mockResolvedValueOnce({
      from: 'home',
      files: [{ fileName: 'first.pdf', fileBytes: buf(1) }, { fileName: 'second.pdf', fileBytes: buf(2) }],
    });
    const [onFile, arrived] = arrivalSpy();
    await act(async () => {
      render(<Harness tool="merge" onFile={onFile} />, container);
    });
    await act(async () => { await arrived; });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe('first.pdf');
    expect(onFile.mock.calls[0][1]).toBe('home');
  });

  it('passes on which tool sent the file, when the record says', async () => {
    takeHandoffMock.mockResolvedValueOnce({ fileName: 'a.pdf', fileBytes: new Uint8Array([1]).buffer, from: 'redact' });
    const [onFile, arrived] = arrivalSpy();
    await act(async () => {
      render(<Harness tool="unlock" onFile={onFile} />, container);
    });
    await act(async () => { await arrived; });
    expect(onFile.mock.calls[0][1]).toBe('redact');
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
    const bytes = new Uint8Array([1, 2]).buffer;
    takeHandoffMock.mockResolvedValueOnce({ fileName: 'merged.pdf', fileBytes: bytes });

    const [onFile, arrived] = arrivalSpy();
    await act(async () => {
      render(<Harness tool="split" onFile={onFile} />, container);
    });
    await act(async () => { await arrived; });

    expect(onFile.mock.calls[0][0].type).toBe('application/pdf');
  });

  it('does not call onFile when there is no pending hand-off', async () => {
    takeHandoffMock.mockResolvedValueOnce(null);

    const onFile = vi.fn();
    await act(async () => {
      render(<Harness tool="compress" onFile={onFile} />, container);
    });
    await drain();

    expect(onFile).not.toHaveBeenCalled();
  });

  it('drops a late result if the component unmounts before the promise resolves', async () => {
    let resolveHandoff;
    takeHandoffMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveHandoff = resolve;
      }),
    );

    const onFile = vi.fn();
    const committed = nextCommit();
    act(() => {
      render(<Harness tool="compress" onFile={onFile} />, container);
    });

    // Unmount before the pending takeHandoff promise settles.
    act(() => {
      render(null, container);
    });

    await act(async () => {
      resolveHandoff({ fileName: 'late.pdf', fileType: 'application/pdf', fileBytes: new ArrayBuffer(1) });
      await committed;
    });
    await drain();

    expect(onFile).not.toHaveBeenCalled();
  });

  it('calls takeHandoff with the tool name exactly once across re-renders', async () => {
    takeHandoffMock.mockResolvedValue(null);

    const onFileA = vi.fn();
    await act(async () => {
      render(<Harness tool="split" onFile={onFileA} />, container);
    });
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

    expect(takeHandoffMock).toHaveBeenCalledTimes(1);
    expect(takeHandoffMock).toHaveBeenCalledWith('split');
  });

  it.each([
    ['/compress-image/', 'doc.pdf', 'application/pdf', false],
    ['/compress-image/', 'me.jpg', 'image/jpeg', true],
    ['/compress/', 'me.jpg', 'image/jpeg', false],
    ['/compress/', 'doc.pdf', 'application/pdf', true],
  ])('on %s asks the store only for a hand-off that fits the page: %s (%s) -> %s', async (path, fileName, fileType, fits) => {
    history.pushState({}, '', path);
    takeHandoffMock.mockResolvedValueOnce(null);
    await act(async () => {
      render(<Harness tool="compress" onFile={vi.fn()} />, container);
      await Promise.resolve();
    });
    const accept = takeHandoffMock.mock.calls[0][1];
    expect(typeof accept).toBe('function');
    expect(accept({ fileName, fileType, fileBytes: buf(1) })).toBe(fits);
    history.pushState({}, '', '/');
  });

  it('puts no restriction on a tool that takes whatever it is handed', async () => {
    history.pushState({}, '', '/sign/');
    takeHandoffMock.mockResolvedValueOnce(null);
    await act(async () => {
      render(<Harness tool="sign" onFile={vi.fn()} />, container);
    });
    await drain();
    expect(takeHandoffMock).toHaveBeenCalledWith('sign');
    history.pushState({}, '', '/');
  });
});

describe('hand-off arrival mark (DEBT-58)', () => {
  let container;
  beforeEach(() => {
    takeHandoffMock.mockReset();
    resetFileArrivalForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });
  const run = async (ui, arrived) => {
    await act(async () => {
      render(ui, container);
    });
    await act(async () => { await arrived; });
  };

  it('marks a hand-off from an analytics tool with that tool, before the callback runs', async () => {
    takeHandoffMock.mockResolvedValueOnce({ from: 'redact', fileName: 'a.pdf', fileBytes: buf(1) });
    let seen;
    const [onFile, arrived] = arrivalSpy(() => { seen = takeArrival(); });
    await run(<Harness tool="unlock" onFile={onFile} />, arrived);
    expect(seen).toEqual({ source: 'handoff', from: 'redact' });
  });

  it('marks a hand-off from an unknown sender without a from', async () => {
    takeHandoffMock.mockResolvedValueOnce({ from: 'elsewhere', files: [{ fileName: 'a.pdf', fileBytes: buf(1) }] });
    let seen;
    const [onFiles, arrived] = arrivalSpy(() => { seen = takeArrival(); });
    await run(<FilesHarness tool="merge" onFiles={onFiles} />, arrived);
    expect(seen).toEqual({ source: 'handoff' });
  });
});

describe('hand-off survives a reload before it is stored (2026-11-12)', () => {
  let container;
  beforeEach(() => {
    takeHandoffMock.mockReset();
    commitHandoffMock.mockClear();
    cacheRecentFileMock.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });
  it('keeps the record until the PDF is in recents, then deletes it', async () => {
    sessionStorage.setItem('pdkef:handoff-pending:sign', '1');
    let stored;
    takeHandoffMock.mockResolvedValueOnce({ fileName: 'a.pdf', fileBytes: buf(1) });
    const [onFiles, arrived] = arrivalSpy();
    const cacheStarted = Promise.withResolvers();
    cacheRecentFileMock.mockImplementationOnce(() => {
      cacheStarted.resolve();
      return new Promise((r) => { stored = r; });
    });
    await act(async () => {
      render(<FilesHarness tool="sign" onFiles={onFiles} />, container);
    });
    await act(async () => { await cacheStarted.promise; });
    // The write has started but not finished: this is the window a reload lands in.
    expect(cacheRecentFileMock).toHaveBeenCalledTimes(1);
    expect(cacheRecentFileMock.mock.calls[0][0]).toBe('sign');
    expect(commitHandoffMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBe('1');
    await act(async () => { stored(true); await arrived; });
    expect(commitHandoffMock).toHaveBeenCalledWith('sign');
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBeNull();
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it('still commits when the recents write fails, so a stale record is not re-opened every visit', async () => {
    cacheRecentFileMock.mockRejectedValueOnce(new Error('quota'));
    takeHandoffMock.mockResolvedValueOnce({ fileName: 'a.pdf', fileBytes: buf(1) });
    const [onFiles, arrived] = arrivalSpy();
    await act(async () => {
      render(<FilesHarness tool="sign" onFiles={onFiles} />, container);
    });
    await act(async () => { await arrived; });
    expect(commitHandoffMock).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledTimes(1);
  });
});
