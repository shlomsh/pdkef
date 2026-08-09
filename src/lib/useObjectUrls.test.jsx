import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { useObjectUrls } from './useObjectUrls.js';

// No @testing-library/preact-hooks in this repo, so a tiny harness component
// exposes the hook's return value onto a ref every render - the same pattern
// used for real component tests elsewhere, just for a hook instead of markup.
function Harness({ apiRef }) {
  apiRef.current = useObjectUrls();
  return null;
}

describe('useObjectUrls', () => {
  let container;
  let apiRef;
  let nextUrl;
  let createSpy;
  let revokeSpy;

  beforeEach(() => {
    nextUrl = 0;
    createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++nextUrl}`);
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
    act(() => {
      render(<Harness apiRef={apiRef} />, container);
    });
  });

  afterEach(() => {
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    container.remove();
  });

  it('starts with no url', () => {
    expect(apiRef.current.url).toBeNull();
  });

  it('creates an object URL from a blob', () => {
    const blob = new Blob(['a']);
    act(() => apiRef.current.setBlob(blob));
    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(apiRef.current.url).toBe('blob:1');
  });

  it('revokes the previous url when replaced with a new blob', () => {
    act(() => apiRef.current.setBlob(new Blob(['a'])));
    const first = apiRef.current.url;
    act(() => apiRef.current.setBlob(new Blob(['b'])));
    expect(revokeSpy).toHaveBeenCalledWith(first);
    expect(apiRef.current.url).toBe('blob:2');
  });

  it('clear() revokes the current url and resets to null', () => {
    act(() => apiRef.current.setBlob(new Blob(['a'])));
    const url = apiRef.current.url;
    act(() => apiRef.current.clear());
    expect(revokeSpy).toHaveBeenCalledWith(url);
    expect(apiRef.current.url).toBeNull();
  });

  it('clear() on an already-empty url is a no-op, not a revoke(null) call', () => {
    act(() => apiRef.current.clear());
    expect(revokeSpy).not.toHaveBeenCalled();
    expect(apiRef.current.url).toBeNull();
  });

  it('revokes whatever is current on unmount', () => {
    act(() => apiRef.current.setBlob(new Blob(['a'])));
    const url = apiRef.current.url;
    act(() => render(null, container));
    expect(revokeSpy).toHaveBeenCalledWith(url);
  });

  it('does not revoke on unmount if nothing was ever created', () => {
    act(() => render(null, container));
    expect(revokeSpy).not.toHaveBeenCalled();
  });
});
