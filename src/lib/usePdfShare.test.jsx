import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockNativeFileShare } from '../test/support/mockFileShare.js';
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
});
