// @ts-nocheck - test harness, same convention as PdfCompressTool.test.tsx
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { useHandoffIntake } from './useHandoffIntake.ts';

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
