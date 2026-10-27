import { useEffect, useRef, useState } from 'preact/hooks';
import { useModalDialog } from '../../../shell/useModalDialog.ts';
import type { MutableRef } from 'preact/hooks';
import { deriveFileKind } from '../../../lib/fileKind.js';
import { reportError } from '../../../lib/errorReport.ts';
import { comparePreviewWidth } from '../lib/compareSize.js';

export type PreviewStatus = 'idle' | 'loading' | 'error';
interface PreviewPair { before: string; after: string }

// Resolves with `url` once the browser has decoded it, so the <img> showing it has its height on the
// first frame it paints. Painted earlier, the centred in-flight panel was its label row alone and
// jumped 142px when the photo decoded (DEBT-56). The skeleton holds the place until then.
const decoded = (url: string) => {
  const img = new Image();
  img.src = url;
  // expected: a decode failure is the <img>'s to show; waiting longer would not help it
  return (img.decode ? img.decode() : Promise.resolve()).then(() => url, () => url);
};

const isImage = (file: File) => deriveFileKind(file) === 'image';

/**
 * Compress's before/after previews (SEO-25, extended to images 2026-09-12), kept out of the island:
 *  - the ORIGINAL's first page, rendered once when a file is accepted and shown while a run is in
 *    flight, then reused as the slider's "before" so only the compressed page renders after the run;
 *  - the inline slider's pair, opened on its own as soon as a result exists;
 *  - the full screen pair (COMP-01), rendered larger on first open and cached for the current result.
 * A PDF renders through the lazily imported `renderComparePreview` (it stays off the result's critical
 * path); an image needs no rasterising, only object URLs for bytes already on the device.
 *
 * `runTokenRef` is the island's run counter: every render here reads it before its first await and
 * lands nothing if it moved (a drop, a Replace pick, an option change).
 */
export function useComparePreviews({ runTokenRef }: { runTokenRef: MutableRef<number> }) {
  const [original, setOriginal] = useState<string | null>(null);
  // True while the original is still rendering or decoding, so a result that lands first holds its place.
  const [originalPending, setOriginalPending] = useState(false);
  const originalTokenRef = useRef(0);
  const originalPromiseRef = useRef<Promise<string | null> | null>(null);
  const originalImageUrlRef = useRef<string | null>(null);

  const [previews, setPreviews] = useState<PreviewPair | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('idle');
  // An image's pair holds object URLs; not run through useObjectUrls because both sides must land in
  // `previews` in one tick. Tracked so they are revoked the same way.
  const imageUrlsRef = useRef<PreviewPair | null>(null);

  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenPreviews, setFullscreenPreviews] = useState<PreviewPair | null>(null);
  const [fullscreenStatus, setFullscreenStatus] = useState<PreviewStatus>('idle');
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => () => {
    if (originalImageUrlRef.current) URL.revokeObjectURL(originalImageUrlRef.current);
  }, []);

  /** Drops the original of the previous file. */
  const clearOriginal = () => {
    originalTokenRef.current += 1;
    originalPromiseRef.current = null;
    if (originalImageUrlRef.current) URL.revokeObjectURL(originalImageUrlRef.current);
    originalImageUrlRef.current = null;
    setOriginal(null);
    setOriginalPending(false);
  };

  /** Starts rendering (PDF) or decoding (image) the original; belongs to the file, not to a run. */
  const loadOriginal = (source: File) => {
    const token = originalTokenRef.current;
    setOriginalPending(true);
    if (isImage(source)) {
      const url = URL.createObjectURL(source);
      originalImageUrlRef.current = url;
      originalPromiseRef.current = decoded(url).then((u) => {
        if (token === originalTokenRef.current) {
          setOriginal(u);
          setOriginalPending(false);
        }
        return u;
      });
      return;
    }
    const width = comparePreviewWidth(window.innerWidth, window.devicePixelRatio || 1, 768);
    originalPromiseRef.current = (async () => {
      try {
        const { renderComparePreview } = await import('../../../lib/thumbnails.js');
        const url = await decoded(await renderComparePreview(source, width));
        if (token === originalTokenRef.current) {
          setOriginal(url);
          setOriginalPending(false);
        }
        return url as string;
      } catch (err) {
        if (token === originalTokenRef.current) {
          setOriginalPending(false);
          reportError('pdf_render', err, 'render_compare_preview');
          console.error(err);
        }
        return null;
      }
    })();
  };

  /** Drops the result's previews (inline and full screen); the original stays. */
  const clear = () => {
    if (imageUrlsRef.current) {
      URL.revokeObjectURL(imageUrlsRef.current.after);
      imageUrlsRef.current = null;
    }
    setPreviews(null);
    setStatus('idle');
    setFullscreenOpen(false);
    setFullscreenPreviews(null);
    setFullscreenStatus('idle');
  };

  /** An option changed: a spinner or error for the old result no longer applies. */
  const resetStatus = () => {
    setStatus('idle');
    setFullscreenStatus('idle');
  };

  /** Builds the inline pair for a result. Takes the file and blob as arguments: it runs when a result
   * lands, and the closure it is called from can be a render behind. */
  const open = async (file: File | null, blob: Blob | null) => {
    if (!file || !blob) return;
    if (isImage(file)) {
      const before = originalImageUrlRef.current ?? URL.createObjectURL(file);
      const after = URL.createObjectURL(blob);
      imageUrlsRef.current = { before, after };
      setPreviews({ before, after });
      return;
    }
    const runToken = runTokenRef.current;
    const width = comparePreviewWidth(window.innerWidth, window.devicePixelRatio || 1, 768);
    setStatus('loading');
    try {
      const { renderComparePreview } = await import('../../../lib/thumbnails.js');
      const [pending, after] = await Promise.all([
        originalPromiseRef.current ?? Promise.resolve(null),
        renderComparePreview(blob, width),
      ]);
      const before = pending ?? await renderComparePreview(file, width);
      if (runToken !== runTokenRef.current) return;
      setPreviews({ before, after });
      setStatus('idle');
    } catch (err) {
      if (runToken !== runTokenRef.current) return;
      reportError('pdf_render', err, 'render_compare_preview');
      console.error(err);
      setStatus('error');
    }
  };

  /** Opens the full screen view; the PDF path renders both sides at the viewport's width once per result. */
  const openFullscreen = async (file: File | null, blob: Blob | null) => {
    if (!file || !blob) return;
    setFullscreenOpen(true);
    if (fullscreenPreviews || fullscreenStatus === 'loading') return;
    if (isImage(file)) {
      if (previews) setFullscreenPreviews(previews);
      return;
    }
    const runToken = runTokenRef.current;
    const width = comparePreviewWidth(window.innerWidth, window.devicePixelRatio || 1, window.innerWidth);
    setFullscreenStatus('loading');
    try {
      const { renderComparePreview } = await import('../../../lib/thumbnails.js');
      const [before, after] = await Promise.all([
        renderComparePreview(file, width),
        renderComparePreview(blob, width),
      ]);
      if (runToken !== runTokenRef.current) return;
      setFullscreenPreviews({ before, after });
      setFullscreenStatus('idle');
    } catch (err) {
      if (runToken !== runTokenRef.current) return;
      reportError('pdf_render', err, 'render_compare_preview');
      console.error(err);
      setFullscreenStatus('error');
    }
  };

  // The hook opens it in the top layer; closeFullscreen below closes it.
  useModalDialog(dialogRef, fullscreenOpen, () => {}, { escape: false, closeWhenHidden: false });

  const closeFullscreen = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.open = false;
    }
    setFullscreenOpen(false);
  };

  return {
    original,
    originalPending,
    previews,
    status,
    fullscreen: { open: fullscreenOpen, previews: fullscreenPreviews, status: fullscreenStatus, dialogRef, onClosed: () => setFullscreenOpen(false) },
    loadOriginal,
    clearOriginal,
    clear,
    resetStatus,
    open,
    openFullscreen,
    closeFullscreen,
  };
}
