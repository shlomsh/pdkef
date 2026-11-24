// @vitest-environment jsdom
import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ResultSection from './ResultSection.tsx';
import ResultNotes from './ResultNotes.tsx';
import { useComparePreviews } from '../hooks/useComparePreviews.ts';
import { resultViewFor, showCompare } from '../lib/islandView.ts';
import { formatBytes } from '../lib/resultView.ts';
import { metaOf } from '../lib/compressMeta.test-helper.ts';
import { englishCompressMessages, type CompressMessages } from '../messages';
import { HeldFile } from '../../../test/support/heldFile.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';

type Compare = ReturnType<typeof useComparePreviews>;
type Dimensions = { width: number; height: number; originalWidth: number; originalHeight: number };

interface Case {
  t?: CompressMessages;
  file: File;
  kind: 'pdf' | 'image';
  status: 'idle' | 'processing' | 'done' | 'error';
  level?: string;
  targetKB?: number;
  flatten?: boolean;
  passthrough?: boolean;
  unchanged?: boolean;
  metTarget?: boolean;
  imageReason?: string | null;
  rasterBytes?: number | null;
  compressedSize?: number | null;
  dimensions?: Dimensions | null;
}

const pdfFile = (name = 'doc.pdf', bytes = 400_000) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
const photoFile = (name = 'photo.jpg', bytes = 90_000) => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });
const blobOf = (bytes: number, type: string) => new Blob([new Uint8Array(bytes)], { type });

/** The island's result column and the notes beside Download, over the real previews hook. */
function Stage({ apiRef, c }: { apiRef: { current: Compare | null }; c: Case }) {
  const runTokenRef = useRef(0);
  const compare = useComparePreviews({ runTokenRef });
  apiRef.current = compare;
  const t = c.t ?? englishCompressMessages;
  const isDone = c.status === 'done';
  const passthrough = c.passthrough ?? false;
  const view = resultViewFor(
    { t, file: c.file, kind: c.kind, level: c.level ?? 'medium', targetKB: c.targetKB ?? 100, flatten: c.flatten ?? false },
    {
      isDone,
      compressedSize: c.compressedSize ?? null,
      meta: metaOf({ passthrough, unchanged: c.unchanged ?? false, metTarget: c.metTarget ?? true, rasterBytes: c.rasterBytes ?? null, imageReason: c.imageReason ?? null }),
    },
  );
  return (
    <>
      <ResultSection
        t={t}
        compare={compare}
        file={c.file}
        lastBlob={null}
        status={c.status}
        kind={c.kind}
        arrow="→"
        isDone={isDone}
        showCompare={showCompare(isDone, passthrough)}
        passthrough={passthrough}
        unchanged={c.unchanged ?? false}
        rasterBytes={c.rasterBytes ?? null}
        dimensions={c.dimensions ?? null}
        compressedSize={c.compressedSize ?? null}
        compareCaption={t.compareCaptionPdf}
        view={view}
      />
      <ResultNotes view={view} isDone={isDone} passthrough={passthrough} />
    </>
  );
}

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host!));
    host.remove();
    host = null;
  }
});

function mountStage(c: Case) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const apiRef: { current: Compare | null } = { current: null };
  act(() => render(<Stage apiRef={apiRef} c={c} />, host!));
  return { api: () => apiRef.current! };
}

const result = () => host!.querySelector('[data-result]')!;
const notes = () => host!.querySelector('[data-result-notes]');
const panel = () => host!.querySelector('[data-compare-panel]');
const labels = () => host!.querySelector('[data-compare-labels]')!;
const fullScreenButton = () => Array.from(host!.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Full screen');

describe('ResultSection', () => {
  describe('a failed run', () => {
    it('shows the error', () => {
      mountStage({ file: pdfFile(), kind: 'pdf', status: 'error' });
      const alert = host!.querySelector('[role="alert"]')!;
      expect(alert.textContent).toContain('Compression failed.');
      expect(alert.textContent).toContain(englishCompressMessages.compressionFailedBody);
      expect(panel()).toBeNull();
    });

    it('words the failure for a photo', () => {
      mountStage({ file: photoFile(), kind: 'image', status: 'error' });
      expect(host!.querySelector('[role="alert"]')!.textContent).toContain(englishCompressMessages.imageCompressionFailedBody);
    });
  });

  describe('the comparison', () => {
    it('shows a skeleton while the previews are pending, with no images and no show or hide toggle', async () => {
      const pdf = pdfFile();
      const compressedPdf = new HeldFile(new Uint8Array(120_000), 'doc-compressed.pdf');
      const { api } = mountStage({ file: pdf, kind: 'pdf', status: 'done', compressedSize: 120_000 });
      act(() => { void api().open(pdf, compressedPdf); });
      await act(async () => { await compressedPdf.started; });
      expect(panel()).not.toBeNull();
      expect(panel()!.querySelector('[data-compare-skeleton]')).not.toBeNull();
      expect(panel()!.querySelectorAll('img')).toHaveLength(0);
      expect(panel()!.querySelectorAll('button')).toHaveLength(0);
      expect(panel()!.textContent).toContain(englishCompressMessages.compareRendering);
    });

    it('renders both pages once the previews exist, and only the Full screen button is left', async () => {
      const photo = photoFile();
      const { api } = mountStage({ file: photo, kind: 'image', status: 'done', compressedSize: 30_000 });
      await act(async () => { await api().open(photo, blobOf(30_000, 'image/jpeg')); });
      expect(panel()!.querySelector('[data-compare-skeleton]')).toBeNull();
      expect(panel()!.querySelectorAll('img')).toHaveLength(2);
      expect(Array.from(panel()!.querySelectorAll('button')).map((b) => b.textContent!.trim())).toEqual(['Full screen']);
    });

    it('shows a compareBeforeLabel override from messages in the rendered slider', async () => {
      const photo = photoFile();
      const t = { ...englishCompressMessages, compareBeforeLabel: 'המקור' };
      const { api } = mountStage({ t, file: photo, kind: 'image', status: 'done', compressedSize: 30_000 });
      await act(async () => { await api().open(photo, blobOf(30_000, 'image/jpeg')); });
      expect(panel()!.querySelectorAll('img')).toHaveLength(2);
      expect(panel()!.textContent).toContain('המקור');
    });

    it('the inline slider has no tags on the images, and a label row above it names both sides with their sizes', async () => {
      const photo = photoFile();
      const { api } = mountStage({ file: photo, kind: 'image', status: 'done', compressedSize: 30_000 });
      await act(async () => { await api().open(photo, blobOf(30_000, 'image/jpeg')); });
      expect(panel()!.querySelector('[role="slider"]')).not.toBeNull();
      expect(panel()!.querySelector('img ~ span')).toBeNull();
      expect(labels().textContent).toContain(`Compressed · ${formatBytes(30_000)}`);
      expect(labels().textContent).toContain(`Original · ${formatBytes(photo.size)}`);
    });

    it('renders the comparison for an image result with no rasterization, the notice beside Download and not under the preview', async () => {
      const photo = photoFile('portrait.jpg', 90_000);
      const { api } = mountStage({ file: photo, kind: 'image', status: 'done', compressedSize: 30_000, level: 'target' });
      await act(async () => { await api().open(photo, blobOf(30_000, 'image/jpeg')); });
      expect(panel()!.querySelectorAll('img')).toHaveLength(2);
      expect(notes()!.textContent).toContain('once compressed, the output is a JPEG');
      expect(notes()!.textContent).not.toContain('so the file is untouched');
      expect(result().textContent).not.toContain('once compressed, the output is a JPEG');
    });
  });

  describe('while a run is in flight', () => {
    it('shows the original page with its label and size, and the compressed side says Compressing', async () => {
      const photo = photoFile();
      const { api } = mountStage({ file: photo, kind: 'image', status: 'processing' });
      act(() => api().loadOriginal(photo));
      await waitUntil(() => api().original !== null);
      expect(result().querySelectorAll('img')).toHaveLength(1);
      expect(result().querySelector('[data-compare-skeleton]')).toBeNull();
      expect(labels().textContent).toContain(`Original · ${formatBytes(photo.size)}`);
      expect(labels().textContent).toContain('Compressing');
    });

    it('keeps the skeleton until the original has rendered', () => {
      mountStage({ file: pdfFile(), kind: 'pdf', status: 'processing' });
      expect(result().querySelector('[data-compare-skeleton]')).not.toBeNull();
      expect(result().querySelector('img')).toBeNull();
      expect(host!.querySelector('[data-compare-labels]')).toBeNull();
    });
  });

  describe('a passthrough result', () => {
    it('holds the original place with the skeleton beside the stats while the original is pending', async () => {
      const pdf = pdfFile();
      const { api } = mountStage({
        file: pdf, kind: 'pdf', status: 'done', passthrough: true, imageReason: 'under-target', level: 'target', compressedSize: pdf.size,
      });
      // reason: loadOriginal sets the pending flag before its first await; the render that follows is what is asserted
      act(() => api().loadOriginal(pdf));
      expect(result().querySelector('[data-stats-grid]')).not.toBeNull();
      expect(result().querySelector('[data-compare-skeleton]')).not.toBeNull();
      expect(result().querySelector('img')).toBeNull();
      await waitUntil(() => !api().originalPending);
      expect(result().querySelector('[data-compare-skeleton]')).toBeNull();
    });

    it('says an image already under the target is untouched, with no slider, no Full screen and its dimensions', () => {
      const photo = photoFile('tiny.jpg', 4_000);
      mountStage({
        file: photo, kind: 'image', status: 'done', passthrough: true, level: 'target', compressedSize: photo.size,
        dimensions: { width: 60, height: 40, originalWidth: 60, originalHeight: 40 },
      });
      expect(panel()).toBeNull();
      expect(fullScreenButton()).toBeUndefined();
      expect(result().textContent).toContain('so the file is untouched: same file, same format, nothing re-encoded');
      expect(result().textContent).not.toContain('once compressed, the output is a JPEG');
      expect(result().textContent).toContain('Already under your target');
      expect(result().textContent).toContain('60 × 40');
      expect(result().querySelector('[data-honest-note]')).not.toBeNull();
      expect(notes()).toBeNull();
    });

    it('renders passthroughNotice, not rasterizeNotice, and no slider for a PDF target-mode passthrough result on the pages-to-pictures path', () => {
      const pdf = pdfFile('already_small.pdf', 30_000);
      mountStage({ file: pdf, kind: 'pdf', status: 'done', passthrough: true, level: 'target', flatten: true, compressedSize: pdf.size });
      expect(result().textContent).toContain('so the file is untouched: same file, same format, nothing re-encoded');
      expect(result().textContent).not.toContain('Compression rasterizes PDF pages');
      expect(result().textContent).toContain('Already under your target');
      expect(result().querySelector('[data-honest-note]')).not.toBeNull();
      expect(panel()).toBeNull();
      expect(notes()).toBeNull();
    });

    it('says a PDF is already as small as it gets, instead of a success, when a level hands the input back', () => {
      const pdf = pdfFile('small_form.pdf', 40_000);
      const raster = 90_000;
      mountStage({ file: pdf, kind: 'pdf', status: 'done', passthrough: true, unchanged: true, flatten: true, rasterBytes: raster, compressedSize: pdf.size });
      const text = result().textContent!;
      expect(text).toContain('Already as small as it gets');
      expect(text).toContain(`Turned into images, this PDF came to ${formatBytes(raster)}, more than the ${formatBytes(pdf.size)} it is now`);
      expect(text).toContain('As images');
      expect(text).toContain('None, original kept');
      expect(text).not.toContain('Compression rasterizes PDF pages');
      expect(fullScreenButton()).toBeUndefined();
      expect(notes()).toBeNull();
    });

    it('says the target cannot be reached this way, with the real numbers, when Exact size hands the input back', () => {
      const pdf = pdfFile('small_form.pdf', 40_000);
      const raster = 90_000;
      mountStage({
        file: pdf, kind: 'pdf', status: 'done', passthrough: true, unchanged: true, flatten: true, level: 'target', targetKB: 100,
        metTarget: false, rasterBytes: raster, compressedSize: pdf.size,
      });
      const text = result().textContent!;
      expect(text).toContain(formatBytes(raster));
      expect(text).toContain('100 KB can');
      expect(text).toContain("can't be reached this way");
      expect(text).toContain('As images');
      expect(text).not.toContain('Closest achievable');
      expect(notes()).toBeNull();
    });

    it.each([
      ['no-images', 'There are no images in this PDF', 'Already as small as it gets'],
      ['no-gain', 'already compact, so making them smaller saved nothing', 'Already as small as it gets'],
      ['encrypted', "This PDF is locked, so its images can't be recompressed here", 'This PDF is locked'],
      ['unsupported', "stored in a way I can't recompress, so nothing was changed", 'Left as it was'],
    ])('reason %s shows its notice and says the PDF is unchanged', (reason, text, title) => {
      const pdf = pdfFile('same.pdf', 40_000);
      mountStage({ file: pdf, kind: 'pdf', status: 'done', passthrough: true, unchanged: true, imageReason: reason, compressedSize: pdf.size });
      expect(result().textContent).toContain(text);
      expect(result().querySelector('[data-stats-title]')!.textContent).toBe(title);
      expect(result().textContent).toContain('None, original kept');
      expect(result().textContent).not.toContain('As images');
      expect(result().textContent).toContain('Original Size');
      expect(result().querySelector('[data-honest-note]')).not.toBeNull();
      expect(fullScreenButton()).toBeUndefined();
      expect(notes()).toBeNull();
    });

    it('reason under-target shows the untouched notice and is not "already as small as it gets"', () => {
      const pdf = pdfFile('tiny.pdf', 4_000);
      mountStage({ file: pdf, kind: 'pdf', status: 'done', passthrough: true, imageReason: 'under-target', level: 'target', compressedSize: pdf.size });
      expect(result().textContent).toContain('so the file is untouched');
      expect(result().textContent).not.toContain('Already as small as it gets');
      expect(result().textContent).toContain('Already under your target');
      expect(result().querySelector('[data-honest-note]')).not.toBeNull();
    });
  });

  it('a big saving has no notice', () => {
    mountStage({ file: pdfFile(), kind: 'pdf', status: 'done', imageReason: 'smaller', compressedSize: 100_000 });
    expect(result().querySelector('[data-honest-note]')).toBeNull();
    expect(host!.querySelector('[data-compress-warning]')).toBeNull();
    expect(host!.querySelector('[data-stats-title]')).toBeNull();
  });
});
