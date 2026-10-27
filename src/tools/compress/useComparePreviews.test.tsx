// @ts-nocheck - test-only, mirrors usePreparedOutput.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useComparePreviews } from './useComparePreviews.ts';
import * as thumbnails from '../../lib/thumbnails.js';

vi.mock('../../lib/thumbnails.js', () => ({
  renderComparePreview: vi.fn((fileOrBlob) => Promise.resolve(`data:${fileOrBlob instanceof File ? 'before' : 'after'}`)),
}));
vi.mock('../../lib/errorReport.ts', () => ({ reportError: vi.fn() }));

const pdf = () => new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
const photo = () => new File(['jpg'], 'a.jpg', { type: 'image/jpeg' });
const blob = (type = 'application/pdf') => new Blob(['out'], { type });

function Harness({ apiRef, runTokenRef }) {
  apiRef.current = useComparePreviews({ runTokenRef });
  return null;
}

describe('useComparePreviews', () => {
  let root;
  let api;
  let runTokenRef;
  let urls;
  beforeEach(() => {
    root = document.createElement('div');
    api = { current: null };
    runTokenRef = { current: 0 };
    urls = [];
    URL.createObjectURL = vi.fn(() => { const u = `blob:u${urls.length}`; urls.push(u); return u; });
    URL.revokeObjectURL = vi.fn();
    vi.clearAllMocks();
    thumbnails.renderComparePreview.mockImplementation((fileOrBlob) => Promise.resolve(`data:${fileOrBlob instanceof File ? 'before' : 'after'}`));
    act(() => render(<Harness apiRef={api} runTokenRef={runTokenRef} />, root));
  });
  afterEach(() => act(() => render(null, root)));

  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

  it('renders a PDF pair from the already rendered original and the result', async () => {
    await act(async () => api.current.loadOriginal(pdf()));
    await settle();
    expect(api.current.original).toBe('data:before');
    expect(api.current.originalPending).toBe(false);
    await act(async () => api.current.open(pdf(), blob()));
    await settle();
    expect(api.current.previews).toEqual({ before: 'data:before', after: 'data:after' });
    expect(api.current.status).toBe('idle');
    // the original was reused: one render for it, one for the result
    expect(thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
  });

  it('makes an image pair from object urls, with no rendering, and revokes the result side on clear', async () => {
    const file = photo();
    await act(async () => api.current.open(file, blob('image/jpeg')));
    expect(api.current.previews).toEqual({ before: urls[0], after: urls[1] });
    expect(thumbnails.renderComparePreview).not.toHaveBeenCalled();
    act(() => api.current.clear());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(urls[1]);
    expect(api.current.previews).toBeNull();
  });

  it('lands nothing when the run token moved while rendering', async () => {
    const open = api.current.open(pdf(), blob());
    runTokenRef.current += 1;
    await act(async () => { await open; });
    await settle();
    expect(api.current.previews).toBeNull();
  });

  it('reports a failed render as the error status', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    thumbnails.renderComparePreview.mockRejectedValue(new Error('boom'));
    await act(async () => api.current.open(pdf(), blob()));
    await settle();
    expect(api.current.status).toBe('error');
    act(() => api.current.resetStatus());
    expect(api.current.status).toBe('idle');
  });

  it('renders the full screen pair once per result and clears it with the result', async () => {
    const file = pdf();
    const out = blob();
    await act(async () => api.current.openFullscreen(file, out));
    await settle();
    expect(api.current.fullscreen.open).toBe(true);
    expect(api.current.fullscreen.previews).toEqual({ before: 'data:before', after: 'data:after' });
    const calls = thumbnails.renderComparePreview.mock.calls.length;
    act(() => api.current.closeFullscreen());
    expect(api.current.fullscreen.open).toBe(false);
    await act(async () => api.current.openFullscreen(file, out));
    expect(thumbnails.renderComparePreview.mock.calls.length).toBe(calls);
    act(() => api.current.clear());
    expect(api.current.fullscreen.open).toBe(false);
    expect(api.current.fullscreen.previews).toBeNull();
  });

  it('drops the original of the previous file and revokes an image original', async () => {
    await act(async () => api.current.loadOriginal(photo()));
    await settle();
    expect(api.current.original).toBe(urls[0]);
    act(() => api.current.clearOriginal());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(urls[0]);
    expect(api.current.original).toBeNull();
    expect(api.current.originalPending).toBe(false);
  });
});
