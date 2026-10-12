// @ts-nocheck - test harness, same convention as PdfCompressTool.test.tsx
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { filesFromHandoff, useHandoffFilesIntake, useHandoffIntake } from './useHandoffIntake.ts';

const { takeHandoffMock } = vi.hoisted(() => ({ takeHandoffMock: vi.fn() }));

vi.mock('./drafts/draftStore.js', () => ({
  takeHandoff: takeHandoffMock,
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

  const settle = async (ui) => {
    await act(async () => {
      render(ui, container);
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('hands onFiles every file of a multi record in order, with from', async () => {
    takeHandoffMock.mockResolvedValueOnce({
      from: 'home',
      files: [{ fileName: 'a.pdf', fileBytes: buf(1) }, { fileName: 'b.pdf', fileBytes: buf(2) }],
    });
    const onFiles = vi.fn();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0].map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(onFiles.mock.calls[0][1]).toBe('home');
  });

  it('hands onFiles [file] for a single record', async () => {
    takeHandoffMock.mockResolvedValueOnce({ fileName: 'a.pdf', fileBytes: buf(1) });
    const onFiles = vi.fn();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />);
    expect(onFiles.mock.calls[0][0].map((f) => f.name)).toEqual(['a.pdf']);
  });

  it('does not call onFiles when there is nothing pending or the record is invalid', async () => {
    takeHandoffMock.mockResolvedValueOnce(null);
    const onFiles = vi.fn();
    await settle(<FilesHarness tool="merge" onFiles={onFiles} />);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('drops a result that resolves after unmount', async () => {
    let resolveHandoff;
    takeHandoffMock.mockReturnValueOnce(new Promise((r) => { resolveHandoff = r; }));
    const onFiles = vi.fn();
    act(() => { render(<FilesHarness tool="merge" onFiles={onFiles} />, container); });
    act(() => { render(null, container); });
    await act(async () => {
      resolveHandoff({ files: [{ fileName: 'late.pdf', fileBytes: buf(1) }] });
      await Promise.resolve();
      await Promise.resolve();
    });
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

    const onFile = vi.fn();
    await act(async () => {
      render(<Harness tool="compress" onFile={onFile} />, container);
      await Promise.resolve();
      await Promise.resolve();
    });

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
    const onFile = vi.fn();
    await act(async () => {
      render(<Harness tool="merge" onFile={onFile} />, container);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe('first.pdf');
    expect(onFile.mock.calls[0][1]).toBe('home');
  });

  it('passes on which tool sent the file, when the record says', async () => {
    takeHandoffMock.mockResolvedValueOnce({ fileName: 'a.pdf', fileBytes: new Uint8Array([1]).buffer, from: 'redact' });
    const onFile = vi.fn();
    await act(async () => {
      render(<Harness tool="unlock" onFile={onFile} />, container);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onFile.mock.calls[0][1]).toBe('redact');
  });

  it('defaults to application/pdf when the record carries no fileType', async () => {
    const bytes = new Uint8Array([1, 2]).buffer;
    takeHandoffMock.mockResolvedValueOnce({ fileName: 'merged.pdf', fileBytes: bytes });

    const onFile = vi.fn();
    await act(async () => {
      render(<Harness tool="split" onFile={onFile} />, container);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onFile.mock.calls[0][0].type).toBe('application/pdf');
  });

  it('does not call onFile when there is no pending hand-off', async () => {
    takeHandoffMock.mockResolvedValueOnce(null);

    const onFile = vi.fn();
    await act(async () => {
      render(<Harness tool="compress" onFile={onFile} />, container);
      await Promise.resolve();
      await Promise.resolve();
    });

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
    act(() => {
      render(<Harness tool="compress" onFile={onFile} />, container);
    });

    // Unmount before the pending takeHandoff promise settles.
    act(() => {
      render(null, container);
    });

    await act(async () => {
      resolveHandoff({ fileName: 'late.pdf', fileType: 'application/pdf', fileBytes: new ArrayBuffer(1) });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onFile).not.toHaveBeenCalled();
  });

  it('calls takeHandoff with the tool name exactly once across re-renders', async () => {
    takeHandoffMock.mockResolvedValue(null);

    const onFileA = vi.fn();
    await act(async () => {
      render(<Harness tool="split" onFile={onFileA} />, container);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Re-render with a new onFile identity (as a component whose
    // handleFilesAdded closes over per-render state would pass) - the [tool]
    // dependency must not re-run the effect just because the callback
    // reference changed.
    const onFileB = vi.fn();
    await act(async () => {
      render(<Harness tool="split" onFile={onFileB} />, container);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(takeHandoffMock).toHaveBeenCalledTimes(1);
    expect(takeHandoffMock).toHaveBeenCalledWith('split');
  });
});
