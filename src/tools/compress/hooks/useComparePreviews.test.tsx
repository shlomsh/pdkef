import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { useComparePreviews } from './useComparePreviews.ts';
import * as thumbnails from '#lib/pdf/thumbnails.js';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import '../../../test/support/realPdfjs.ts';
import { comparePreviewWidth } from '../lib/compareSize.js';

vi.mock('#lib/pdf/thumbnails.js', { spy: true });

// Two real one-page PDFs of different shapes, so the original and the result render to different pictures.
let originalBytes: Uint8Array<ArrayBuffer>;
let resultBytes: Uint8Array<ArrayBuffer>;
let BEFORE: string;
let AFTER: string;
let FULL_BEFORE: string;
let FULL_AFTER: string;
const onePage = async (height: number) => {
  const doc = await PDFDocument.create();
  doc.addPage([100, height]);
  return new Uint8Array(await doc.save());
};
const pdf = () => new File([originalBytes], 'a.pdf', { type: 'application/pdf' });
const photo = () => new File(['jpg'], 'a.jpg', { type: 'image/jpeg' });
const blob = (type = 'application/pdf') => new Blob([type === 'application/pdf' ? resultBytes : 'out'], { type });

beforeAll(async () => {
  originalBytes = await onePage(120);
  resultBytes = await onePage(160);
  const width = comparePreviewWidth(window.innerWidth, window.devicePixelRatio || 1, 768);
  BEFORE = await thumbnails.renderComparePreview(pdf(), width);
  AFTER = await thumbnails.renderComparePreview(blob(), width);
  const full = comparePreviewWidth(window.innerWidth, window.devicePixelRatio || 1, window.innerWidth);
  FULL_BEFORE = await thumbnails.renderComparePreview(pdf(), full);
  FULL_AFTER = await thumbnails.renderComparePreview(blob(), full);
  expect(BEFORE).toMatch(/^data:image\/png;base64,/);
  expect(AFTER).not.toBe(BEFORE);
});

type Api = ReturnType<typeof useComparePreviews>;

function Harness({ apiRef, runTokenRef }: { apiRef: { current: Api | null }; runTokenRef: { current: number } }) {
  apiRef.current = useComparePreviews({ runTokenRef });
  return null;
}

describe('useComparePreviews', () => {
  let root: HTMLElement;
  let api: { current: Api | null };
  let runTokenRef: { current: number };
  let createUrl: MockInstance<typeof URL.createObjectURL>;
  let revokeUrl: MockInstance<typeof URL.revokeObjectURL>;
  const urls = () => createUrl.mock.results.map((r) => r.value as string);
  beforeEach(() => {
    root = document.createElement('div');
    api = { current: null };
    runTokenRef = { current: 0 };
    // Spy-through: Node's real object URLs, only watched; the created ones are read off the spy.
    createUrl = vi.spyOn(URL, 'createObjectURL');
    revokeUrl = vi.spyOn(URL, 'revokeObjectURL');
    vi.clearAllMocks();
    act(() => render(<Harness apiRef={api} runTokenRef={runTokenRef} />, root));
  });
  afterEach(() => {
    act(() => render(null, root));
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });

  it('renders a PDF pair from the already rendered original and the result', async () => {
    await act(async () => api.current!.loadOriginal(pdf()));
    await waitUntil(() => expect(api.current!.original).toBe(BEFORE));
    expect(api.current!.originalPending).toBe(false);
    await act(async () => api.current!.open(pdf(), blob()));
    expect(api.current!.previews).toEqual({ before: BEFORE, after: AFTER });
    expect(api.current!.status).toBe('idle');
    // the original was reused: one render for it, one for the result
    expect(thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
  });

  it('makes an image pair from object urls, with no rendering, and revokes the result side on clear', async () => {
    const file = photo();
    await act(async () => api.current!.open(file, blob('image/jpeg')));
    expect(api.current!.previews).toEqual({ before: urls()[0], after: urls()[1] });
    expect(thumbnails.renderComparePreview).not.toHaveBeenCalled();
    act(() => api.current!.clear());
    expect(revokeUrl).toHaveBeenCalledWith(urls()[1]);
    expect(api.current!.previews).toBeNull();
  });

  it('lands nothing when the run token moved while rendering', async () => {
    const open = api.current!.open(pdf(), blob());
    runTokenRef.current += 1;
    await act(async () => { await open; });
    expect(api.current!.previews).toBeNull();
  });

  it('reports a failed render as the error status', async () => {
    const error = vi.spyOn(console, 'error');
    const unreadable = new Blob(['not a pdf'], { type: 'application/pdf' });
    await act(async () => api.current!.open(pdf(), unreadable));
    expect(api.current!.status).toBe('error');
    expect(error.mock.calls).toEqual([[expect.objectContaining({ message: 'Invalid PDF structure.' })]]);
    error.mockRestore();
    act(() => api.current!.resetStatus());
    expect(api.current!.status).toBe('idle');
  });

  it('renders the full screen pair once per result and clears it with the result', async () => {
    const file = pdf();
    const out = blob();
    await act(async () => api.current!.openFullscreen(file, out));
    expect(api.current!.fullscreen.open).toBe(true);
    expect(api.current!.fullscreen.previews).toEqual({ before: FULL_BEFORE, after: FULL_AFTER });
    const calls = vi.mocked(thumbnails.renderComparePreview).mock.calls.length;
    act(() => api.current!.closeFullscreen());
    expect(api.current!.fullscreen.open).toBe(false);
    await act(async () => api.current!.openFullscreen(file, out));
    expect(vi.mocked(thumbnails.renderComparePreview).mock.calls.length).toBe(calls);
    act(() => api.current!.clear());
    expect(api.current!.fullscreen.open).toBe(false);
    expect(api.current!.fullscreen.previews).toBeNull();
  });

  it('drops the original of the previous file and revokes an image original', async () => {
    await act(async () => api.current!.loadOriginal(photo()));
    await waitUntil(() => expect(api.current!.original).toBe(urls()[0]));
    act(() => api.current!.clearOriginal());
    expect(revokeUrl).toHaveBeenCalledWith(urls()[0]);
    expect(api.current!.original).toBeNull();
    expect(api.current!.originalPending).toBe(false);
  });
});
