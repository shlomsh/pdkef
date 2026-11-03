import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { usePdfShare } from './usePdfShare.js';

function Harness({ apiRef }) {
  apiRef.current = usePdfShare();
  return null;
}

describe('usePdfShare sharePrepared', () => {
  let container;
  let apiRef;
  let nativeShare;

  beforeEach(() => {
    nativeShare = mockNativeFileShare();
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
    act(() => {
      render(<Harness apiRef={apiRef} />, container);
    });
  });

  afterEach(() => {
    nativeShare.restore();
    container.remove();
  });

  it('shares only the files, so Save to Files on iOS writes the PDF and nothing beside it', async () => {
    act(() => {
      apiRef.current.prepare(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'signed.pdf');
    });
    let result;
    await act(async () => {
      result = await apiRef.current.sharePrepared();
    });
    expect(result.status).toBe('shared');
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
    const payload = nativeShare.share.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(['files']);
    expect(payload.files.map((f) => f.name)).toEqual(['signed.pdf']);
  });

  function prepareSignedPdf() {
    act(() => {
      apiRef.current.prepare(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'signed.pdf');
    });
  }

  it('opens the native sheet once when Share is tapped twice before the first settles', async () => {
    prepareSignedPdf();
    let finishFirst;
    nativeShare.share.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));

    let first;
    let second;
    await act(async () => {
      first = apiRef.current.sharePrepared();
      second = apiRef.current.sharePrepared();
    });
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
    expect(await second).toEqual({ status: 'unavailable' });

    await act(async () => {
      finishFirst();
      expect((await first).status).toBe('shared');
    });

    // The guard lifts once the sheet closes, so a later tap shares again.
    await act(async () => {
      await apiRef.current.sharePrepared();
    });
    expect(nativeShare.share).toHaveBeenCalledTimes(2);
  });

  it('reports a dismissed share sheet as canceled, with the rejection attached', async () => {
    prepareSignedPdf();
    const abort = new DOMException('Share canceled', 'AbortError');
    nativeShare.share.mockRejectedValueOnce(abort);

    let result;
    await act(async () => {
      result = await apiRef.current.sharePrepared();
    });
    expect(result).toEqual({ status: 'canceled', error: abort });
  });

  it('reports any other share failure as an error', async () => {
    prepareSignedPdf();
    const denied = new DOMException('Permission denied', 'NotAllowedError');
    nativeShare.share.mockRejectedValueOnce(denied);

    let result;
    await act(async () => {
      result = await apiRef.current.sharePrepared();
    });
    expect(result).toEqual({ status: 'error', error: denied });
  });
});
