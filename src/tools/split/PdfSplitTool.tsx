import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Shrink } from 'lucide-preact';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { parsePageSelector, pageNumbersToRangeString, splitPdf, outputBaseName } from './split.js';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import styles from './PdfSplitTool.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ProgressRing from '../../shell/ProgressRing.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import { describeFile, formatFileSize } from '../../lib/format.js';
import { getPdfRenderContext } from '../../lib/pdfRender.js';
import { PDFJS_WASM_URL } from '../../lib/pdfjsWasm.js';

let pdfjsLib: any;
async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
  }
  return pdfjsLib;
}

interface SplitPage {
  pageNumber: number;
  selected: boolean;
  thumbnail: string | null;
  /** Cumulative delta from the per-cell rotate control, 0/90/180/270, added
   * on top of the source page's own rotation at export (split.js). */
  rotation: number;
}

interface OutputFile {
  url: string;
  filename: string;
  pageNumber?: number;
  blob: Blob;
}

type Mode = 'combined' | 'separate';
/** idle: no file. loading: reading the PDF. preparing: the output is being
 * built on idle after the last change. ready: something to download.
 * error: the last prepare failed. */
type Status = 'idle' | 'loading' | 'preparing' | 'ready' | 'error';

/** Above this many pages the per-page mode shows one caption line instead of
 * a file name under every cell (review 2026-09-14, P1: fifty captions with
 * the same base name say nothing). */
const PER_CELL_CAPTION_LIMIT = 24;
/** Debounce between the last change and the idle prepare. */
const PREPARE_DELAY_MS = 350;

export interface PdfSplitToolProps {
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

export default function PdfSplitTool({
  navigate = (href) => { window.location.href = href; },
}: PdfSplitToolProps = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pages, setPages] = useState<SplitPage[]>([]);
  const [pageSelector, setPageSelector] = useState('');
  const [pageSelectorError, setPageSelectorError] = useState('');
  const [mode, setMode] = useState<Mode>('combined');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [saved, setSaved] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffFailed, setHandoffFailed] = useState(false);
  const { shareReady, prepareFiles, clearPrepared, sharePrepared } = usePdfShare();

  const primaryRef = useRef<HTMLAnchorElement | null>(null);
  const segmentRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /** Bumped on every change so a prepare that finishes late is dropped. */
  const prepareSeq = useRef(0);
  /**
   * The document load is a separate race from the prepare (DEBT-18): a page
   * selector change must not abandon a thumbnail loop, and a new file must.
   * `begin()` supersedes the run before it, so picking a second file is all
   * the invalidation this needs - no counter of its own beside prepareSeq.
   */
  const loadRun = useLatestRun();
  /** A tap on the element while it was still preparing: deliver on ready. */
  const pendingTap = useRef(false);
  const outputsRef = useRef<OutputFile[]>([]);
  outputsRef.current = outputs;

  const selectedPages = pages.filter((p) => p.selected).map((p) => p.pageNumber);
  const selectedCount = selectedPages.length;
  const renderedCount = pages.filter((p) => p.thumbnail).length;
  const baseName = file ? outputBaseName(file.name) : '';
  // { [pageNumber]: 0|90|180|270 }, non-zero entries only - what splitPdf
  // applies on top of the source page's own rotation.
  const rotations = Object.fromEntries(
    pages.filter((p) => p.rotation).map((p) => [p.pageNumber, p.rotation]),
  );
  const rotationKey = pages.map((p) => p.rotation).join(',');

  const revokeAll = (list: OutputFile[]) => {
    for (const f of list) URL.revokeObjectURL(f.url);
  };

  useEffect(() => () => revokeAll(outputsRef.current), []);

  // A single-slot undo chip (Merge's pattern): the next registered undo
  // silently replaces a pending one rather than stacking, and it clears
  // itself after 5s. Rotate is the only action that uses it today.
  const [undoAction, setUndoAction] = useState<{ message: string; undo: () => void } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerUndo = (message: string, perform: () => void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoAction({
      message,
      undo: () => {
        if (undoTimer.current) clearTimeout(undoTimer.current);
        setUndoAction(null);
        perform();
      },
    });
    undoTimer.current = setTimeout(() => setUndoAction(null), 5000);
  };

  // Any edit invalidates the prepared output; the idle prepare below rebuilds it.
  const invalidate = () => {
    prepareSeq.current += 1;
    pendingTap.current = false;
    clearPrepared();
    setSaved(false);
    setHandoffFailed(false);
    setOutputs((prev) => {
      revokeAll(prev);
      return [];
    });
  };

  // Guideline §2: the work happens on idle, debounced after the last change,
  // cancelled by the next change, so Download is ready by the time the person
  // reads the page. Nothing here leaves the device.
  useEffect(() => {
    if (!file || status === 'loading') return;
    if (selectedCount === 0) {
      setStatus('ready');
      return;
    }
    const seq = ++prepareSeq.current;
    const wanted = selectedPages;
    setStatus('preparing');
    setProgress(0);
    const timer = setTimeout(async () => {
      try {
        const results: any[] = await splitPdf(file, {
          pageNumbers: wanted,
          mode,
          rotations,
          onProgress: (value: number) => {
            if (prepareSeq.current === seq) setProgress(value);
          },
        });
        if (prepareSeq.current !== seq) return;
        const next: OutputFile[] = results.map((r) => ({
          ...r,
          url: URL.createObjectURL(r.blob),
        }));
        setOutputs(next);
        prepareFiles(results.map(({ blob, filename }) => ({ blob, filename, type: 'application/pdf' })));
        setStatus('ready');
      } catch (err) {
        if (prepareSeq.current !== seq) return;
        console.error(err);
        setStatus('error');
        setAnnouncement('Could not prepare the split PDF.');
      }
    }, PREPARE_DELAY_MS);
    return () => clearTimeout(timer);
    // selectedPages and rotationKey are derived from pages; the joins key
    // the effect on the actual selection and rotation, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, mode, selectedPages.join(','), rotationKey, status === 'loading']);

  const downloadAll = useCallback((list: OutputFile[]) => {
    list.forEach((f, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = f.url;
        link.download = f.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 200);
    });
  }, []);

  // A tap while preparing queues the download and delivers on ready.
  useEffect(() => {
    if (status !== 'ready' || !pendingTap.current || outputs.length === 0) return;
    pendingTap.current = false;
    if (mode === 'combined') primaryRef.current?.click();
    else {
      downloadAll(outputs);
      setSaved(true);
    }
  }, [status, outputs, mode, downloadAll]);

  const loadDocumentAndThumbnails = async (pdfFile: File) => {
    const run = loadRun.begin();
    let loadingTask: any = null;
    try {
      const lib = await getPdfjs();
      const bytes = await pdfFile.arrayBuffer();
      if (!run.isCurrent()) return;
      loadingTask = lib.getDocument({ data: bytes, wasmUrl: PDFJS_WASM_URL });
      const pdf = await loadingTask.promise;
      if (!run.isCurrent()) return;

      const pageCount = pdf.numPages;
      setNumPages(pageCount);

      const initialPages = Array.from({ length: pageCount }, (_, idx) => ({
        pageNumber: idx + 1,
        selected: true,
        thumbnail: null,
        rotation: 0,
      }));
      setPages(initialPages);
      setPageSelector(pageNumbersToRangeString(initialPages.map((p) => p.pageNumber)));
      setStatus('ready');
      setAnnouncement(`Loaded PDF "${pdfFile.name}" with ${pageCount} pages.`);

      for (let i = 1; i <= pageCount; i += 1) {
        // Checked per page, not once before the loop: setPages below matches
        // on `p.pageNumber === i` alone, so a loop that outlives its file
        // would stamp this document's thumbnails into the next one's cells
        // one at a time.
        if (!run.isCurrent()) return;
        try {
          const page = await pdf.getPage(i);
          const nativeViewport = page.getViewport({ scale: 1 });
          const scale = 100 / nativeViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = getPdfRenderContext(canvas);

          await page.render({ canvasContext: context, viewport }).promise;
          const url = canvas.toDataURL('image/png');
          if (!run.isCurrent()) return;

          setPages((current) =>
            current.map((p) => (p.pageNumber === i ? { ...p, thumbnail: url } : p)),
          );
        } catch (err) {
          console.error(`Error rendering thumbnail for page ${i}:`, err);
        }
      }

      run.settle();
    } catch (err) {
      console.error('Error loading PDF document:', err);
      if (!run.isCurrent()) return;
      setStatus('error');
      setAnnouncement('Failed to load PDF file.');
    } finally {
      // In `finally` so an abandoned load releases pdf.js too, not only one
      // that walked every page - that was the leak behind the old
      // after-the-loop destroy().
      // try/catch, not `Promise.resolve(destroy()).catch()`: destroy() is
      // called before the wrapper exists, so a synchronous throw would escape
      // this `finally` entirely - past the catch branch's setStatus('error')
      // and out of a `void`-called async function as an unhandled rejection.
      if (loadingTask) {
        try {
          await loadingTask.destroy();
        } catch {
          // An abandoned task failing to release is nothing the person can act on.
        }
      }
    }
  };

  const handleFilesAdded = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf');
    const rejected = incoming.filter((f) => f.type !== 'application/pdf');

    setRejectedFiles(rejected.map((f) => f.name));
    if (pdfs.length === 0) return;

    const picked = pdfs[0];
    invalidate();
    setFile(picked);
    setPages([]);
    setPageSelector('');
    setPageSelectorError('');
    setNumPages(0);
    setStatus('loading');
    void loadDocumentAndThumbnails(picked);
  };

  // MERGE-14: a merged PDF handed off from /merge/ (saveHandoff + navigate)
  // is collected here on mount and dropped straight into the same path a
  // manual pick takes. This tool has no draft to race against, so mount is
  // enough - see useHandoffIntake.ts's own comment for why Sign/Redact
  // instead resolve their hand-off ahead of a draft restore.
  useHandoffIntake('split', (f) => handleFilesAdded([f]));

  const handlePageSelectorChange = (value: string) => {
    setPageSelector(value);
    invalidate();
    try {
      const parsed = parsePageSelector(value, numPages);
      setPages((prev) =>
        prev.map((p) => ({ ...p, selected: parsed.includes(p.pageNumber) })),
      );
      setPageSelectorError('');
    } catch (err: any) {
      // While a selector is being typed ("1-" or "1,") hold the error.
      const isPartial = /[-,]\s*$/.test(value);
      setPageSelectorError(isPartial ? '' : err.message);
    }
  };

  // Review 2026-09-14, P1: a toggled cell stays where it is. Membership is
  // shown by state (dimmed, dashed, struck number), never by moving the cell,
  // so the next tap lands on the page the finger is over.
  const togglePageSelection = (pageNumber: number) => {
    invalidate();
    setPages((prev) => {
      const next = prev.map((p) =>
        p.pageNumber === pageNumber ? { ...p, selected: !p.selected } : p,
      );
      setPageSelector(pageNumbersToRangeString(next.filter((p) => p.selected).map((p) => p.pageNumber)));
      setPageSelectorError('');
      return next;
    });
  };

  // Rotation is a page property, not a selection one: it applies in either
  // mode, and toggling a page out and back in keeps whatever rotation it had.
  const rotatePage = (pageNumber: number) => {
    const snapshot = pages;
    invalidate();
    setPages((prev) =>
      prev.map((p) => (p.pageNumber === pageNumber ? { ...p, rotation: (p.rotation + 90) % 360 } : p)),
    );
    setAnnouncement(`Page ${pageNumber} rotated.`);
    registerUndo(`Rotated page ${pageNumber}`, () => {
      invalidate();
      setPages(snapshot);
    });
  };

  const selectAll = () => {
    invalidate();
    setPages((prev) => {
      const next = prev.map((p) => ({ ...p, selected: true }));
      setPageSelector(pageNumbersToRangeString(next.map((p) => p.pageNumber)));
      setPageSelectorError('');
      return next;
    });
  };

  const selectNone = () => {
    invalidate();
    setPages((prev) => prev.map((p) => ({ ...p, selected: false })));
    setPageSelector('');
    setPageSelectorError('');
  };

  const chooseMode = (next: Mode) => {
    if (next === mode) return;
    invalidate();
    setMode(next);
    setAnnouncement(next === 'combined'
      ? 'Selected pages will become a single PDF.'
      : 'Each selected page will become its own PDF.');
  };

  const onSegmentKeyDown = (e: KeyboardEvent) => {
    const order: Mode[] = ['combined', 'separate'];
    const current = order.indexOf(mode);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % 2;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current + 1) % 2;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    if (next === null) return;
    e.preventDefault();
    chooseMode(order[next]);
    segmentRefs.current[next]?.focus();
  };

  const onPrimaryClick = (event: MouseEvent) => {
    if (selectedCount === 0) {
      event.preventDefault();
      return;
    }
    if (status === 'preparing') {
      event.preventDefault();
      pendingTap.current = true;
      setAnnouncement('Preparing. The download starts as soon as it is ready.');
      return;
    }
    if (status !== 'ready' || outputs.length === 0) {
      event.preventDefault();
      return;
    }
    if (mode === 'separate') {
      event.preventDefault();
      downloadAll(outputs);
    }
    setSaved(true);
    setAnnouncement(mode === 'combined' ? 'PDF saved.' : `${outputs.length} PDFs saved.`);
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement('Split PDF files shared successfully.');
    else if (result.status === 'canceled') setAnnouncement('Sharing canceled. Your PDF files are still ready.');
    else if (result.status === 'error') setAnnouncement('Could not open the share sheet. Please try again.');
  };

  // Cross-tool hand-off (guideline §13): park the prepared bytes for Compress
  // and navigate. Only the single-file mode has one file to hand over.
  const handoffToCompress = async () => {
    const output = outputs[0];
    if (handoffBusy || mode !== 'combined' || !output) return;
    setHandoffBusy(true);
    setHandoffFailed(false);
    try {
      const { saveHandoff } = await import('../../lib/drafts/draftStore.js');
      const ok = await saveHandoff('compress', {
        fileName: output.filename,
        fileType: 'application/pdf',
        fileBytes: await output.blob.arrayBuffer(),
      });
      if (!ok) throw new Error('handoff');
      navigate('/compress/');
    } catch {
      setHandoffFailed(true);
      setHandoffBusy(false);
    }
  };

  const hasFiles = !!file;
  const totalBytes = outputs.reduce((sum, f) => sum + f.blob.size, 0);
  const perCellCaptions = mode === 'separate' && numPages <= PER_CELL_CAPTION_LIMIT;

  const primaryState = selectedCount === 0
    ? 'empty'
    : status === 'preparing' ? 'preparing'
      : status === 'error' ? 'error'
        : saved ? 'saved' : 'ready';
  const combinedOutput = mode === 'combined' ? outputs[0] : undefined;
  const primaryIsLink = !!combinedOutput && (primaryState === 'ready' || primaryState === 'saved');

  const pageWord = (n: number) => `${n} page${n === 1 ? '' : 's'}`;
  const fileWord = (n: number) => `${n} PDF${n === 1 ? '' : 's'}`;

  const canvasHeading = mode === 'combined'
    ? (
      <>
        extracted_<bdi class={styles['output-name']}>{baseName}</bdi>
        <span class={styles['output-ext']}>.pdf</span>
      </>
    )
    : `${fileWord(selectedCount)}, one page each`;
  const canvasCount = `${selectedCount} of ${pageWord(numPages)}`;

  const renderCell = (p: SplitPage) => (
    <div
      key={p.pageNumber}
      class={`${styles.cell}${p.selected ? '' : ` ${styles['is-out']}`}${perCellCaptions && p.selected ? ` ${styles['is-own-file']}` : ''}`}
      onClick={() => togglePageSelection(p.pageNumber)}
      role="checkbox"
      aria-checked={p.selected}
      aria-label={`Page ${p.pageNumber}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          togglePageSelection(p.pageNumber);
        }
      }}
    >
      <div class={styles['cell-thumb']} data-rotation={p.rotation || undefined}>
        {p.thumbnail ? (
          <img class={styles['cell-thumb-img']} src={p.thumbnail} alt="" />
        ) : (
          <div class={`${pdfToolStyles['thumb-placeholder']} ${pdfToolStyles['thumb-placeholder-fill']}`} />
        )}
      </div>
      {/* Always visible, not hover/tap-gated: the cell body's own click
          already toggles inclusion (the frame is the mode), so a second,
          select-to-reveal gesture like Merge's would collide with it on
          touch. One small button fits a corner without the crowding three
          buttons would (ux-design-guidelines §8). */}
      <button
        type="button"
        class={styles['rotate-btn']}
        aria-label={`Rotate page ${p.pageNumber}`}
        onClick={(e) => { e.stopPropagation(); rotatePage(p.pageNumber); }}
      >
        {/* The same rotate-clockwise arrow Edit Pages uses (Shlomi, 2026-09-14:
            a page-with-arrow glyph was not readable as rotate at 14px). */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>
      {perCellCaptions && p.selected ? (
        <span class={styles['cell-caption']} title={`${baseName}-page-${p.pageNumber}.pdf`}>
          {'…-page-'}{p.pageNumber}<span class={styles['output-ext']}>.pdf</span>
        </span>
      ) : (
        <span class={styles['cell-number']}>Page {p.pageNumber}</span>
      )}
    </div>
  );

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool="split"
      analyticsStatus={status === 'preparing' ? 'processing' : saved ? 'done' : status}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      file={file}
      fileLabel={file?.name}
      fileMeta={describeFile(file, numPages)}
    >
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? `Skipped “${rejectedFiles[0]}” - not a PDF.`
            : `Skipped ${rejectedFiles.length} files - not PDFs.`}
        </p>
      )}

      {hasFiles && (
        <div class="tool-workspace">
          {status === 'loading' ? (
            <div class={pdfToolStyles['status-block']}>
              <p class={pdfToolStyles['status-text-muted']}>Loading document pages...</p>
            </div>
          ) : (
            <div class={styles.stage}>
              {/* The heading names the output and spans both columns, so the
                  canvas frame and the rail start on the same line (Shlomi,
                  2026-09-14: the two boxes were not top-aligned). */}
              <div class={styles['canvas-head']}>
                <h3 id="split-canvas-title" class={styles['canvas-title']}>{canvasHeading}</h3>
                <span class={styles['canvas-count']}>{canvasCount}</span>
                {renderedCount < numPages && (
                  <span class={styles['canvas-status']} role="status">Rendering {renderedCount} of {numPages}</span>
                )}
                {undoAction && (
                  <span class={styles['undo-chip']} role="status">
                    {undoAction.message}
                    <button type="button" onClick={undoAction.undo}>Undo</button>
                  </span>
                )}
              </div>

              {/* The canvas: the output, as the person will get it. */}
              <section class={styles.canvas} aria-label="Your split PDF">
                {mode === 'combined' ? (
                  <div class={styles['doc-frame']} data-empty={selectedCount === 0 ? 'true' : undefined}>
                    <div class={styles['frame-caption']}>
                      <span>one document</span>
                      <span class={styles['frame-caption-note']}>
                        {selectedCount === 0
                          ? 'Pick at least one page'
                          : `page${selectedCount === 1 ? '' : 's'} ${pageNumbersToRangeString(selectedPages)}`}
                      </span>
                    </div>
                    <div class={styles.grid} data-scale={numPages <= 8 ? 'large' : undefined}>{pages.map(renderCell)}</div>
                  </div>
                ) : (
                  <div class={styles['doc-frames']}>
                    <div class={styles['frame-caption']}>
                      <span>separate documents</span>
                      <span class={styles['frame-caption-note']}>
                        {selectedCount === 0
                          ? 'Pick at least one page'
                          : <>each saves as <bdi>{baseName}</bdi>-page-N.pdf</>}
                      </span>
                    </div>
                    <div class={styles.grid} data-scale={numPages <= 8 ? 'large' : undefined}>{pages.map(renderCell)}</div>
                  </div>
                )}

                <p class={styles['canvas-hint']}>
                  {selectedCount === numPages
                    ? 'Every page is in. Click a page to leave it out.'
                    : 'Dimmed pages are left out. Click one to bring it back.'}
                </p>

              </section>

              {/* The rail: commands on the selection, the setting, the primary control. */}
              <aside class={styles.rail} aria-label="Split options">
                <div class={styles.commands}>
                  <div class={pdfToolStyles['page-selector-field']}>
                    <div class={styles['command-row']}>
                      <label for="page-selector-input" class={pdfToolStyles['page-selector-label']}>Pages</label>
                      <button type="button" class={styles.command} onClick={selectAll}>Select all</button>
                      <button type="button" class={styles.command} onClick={selectNone}>Clear</button>
                    </div>
                    <input
                      id="page-selector-input"
                      type="text"
                      class={`${pdfToolStyles['page-selector-input']}${pageSelectorError ? ` ${pdfToolStyles['has-error']}` : ''}`}
                      value={pageSelector}
                      onInput={(e) => handlePageSelectorChange((e.target as HTMLInputElement).value)}
                      placeholder="e.g. 1-3, 5, 8-"
                      aria-describedby={pageSelectorError ? 'page-selector-hint' : undefined}
                      aria-invalid={!!pageSelectorError}
                    />
                  </div>
                  {pageSelectorError && (
                    <p id="page-selector-hint" class={pdfToolStyles['page-selector-error']} role="alert">{pageSelectorError}</p>
                  )}
                </div>

                <div class={styles.sheet}>
                  <div class={styles.setting}>
                    <div
                      class={styles.segmented}
                      role="radiogroup"
                      aria-label="What to save"
                      onKeyDown={onSegmentKeyDown}
                    >
                      {(['combined', 'separate'] as Mode[]).map((m, index) => (
                        <button
                          key={m}
                          ref={(el) => { segmentRefs.current[index] = el; }}
                          type="button"
                          role="radio"
                          aria-checked={mode === m}
                          tabIndex={mode === m ? 0 : -1}
                          class={`${styles.segment}${mode === m ? ` ${styles['is-active']}` : ''}`}
                          onClick={() => chooseMode(m)}
                        >
                          {m === 'combined' ? 'One PDF' : 'One PDF per page'}
                        </button>
                      ))}
                    </div>
                    <p class={styles['setting-note']}>
                      {mode === 'combined'
                        ? 'Selected pages become a single PDF.'
                        : 'Each selected page becomes its own PDF.'}
                    </p>
                  </div>

                  <a
                    ref={primaryRef}
                    class={styles.primary}
                    data-state={primaryState}
                    href={primaryIsLink ? combinedOutput!.url : undefined}
                    download={primaryIsLink ? combinedOutput!.filename : undefined}
                    role={primaryIsLink ? undefined : 'button'}
                    tabIndex={0}
                    aria-disabled={primaryState === 'empty' || primaryState === 'error' ? 'true' : undefined}
                    aria-busy={primaryState === 'preparing' ? 'true' : undefined}
                    onClick={onPrimaryClick}
                    onKeyDown={(e) => {
                      if (!primaryIsLink && (e.key === ' ' || e.key === 'Enter')) {
                        e.preventDefault();
                        (e.currentTarget as HTMLAnchorElement).click();
                      }
                    }}
                  >
                    {primaryState === 'empty' ? (
                      <span class={styles['primary-label']}>Pick at least one page</span>
                    ) : primaryState === 'preparing' ? (
                      <ProgressRing progress={progress} label={`Preparing ${pageWord(selectedCount)}…`} />
                    ) : primaryState === 'error' ? (
                      <span class={styles['primary-label']}>Could not prepare this PDF</span>
                    ) : primaryState === 'saved' ? (
                      <>
                        <svg class={styles['primary-check']} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" class={pdfToolStyles['check-circle']} />
                          <path d="M7.5 12.5l3 3 6-6.5" class={pdfToolStyles['check-mark']} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                        </svg>
                        <span class={styles['primary-label']}>
                          {mode === 'combined' ? 'Saved' : `Saved ${fileWord(outputs.length)}`}
                        </span>
                        <span class={styles['primary-detail']}>download again</span>
                      </>
                    ) : (
                      <>
                        <span class={styles['primary-label']}>
                          {mode === 'combined' ? 'Download 1 PDF' : `Download ${fileWord(outputs.length)}`}
                        </span>
                        <span class={styles['primary-detail']}>
                          {mode === 'combined'
                            ? `${pageWord(selectedCount)} · ${formatFileSize(totalBytes)}`
                            : `1 page each · ${formatFileSize(totalBytes)}`}
                        </span>
                      </>
                    )}
                  </a>

                  {/* Guideline §4, row 6: next steps sit right after the
                      primary control. The segmented control is directly
                      above Download in this same block, so a quiet "or
                      switch mode" line here would only repeat a control
                      already in view - dropped (Shlomi, 2026-09-14).
                      Share appears the moment there is something to share
                      (PdfShareButton's own `visible` prop, not gated behind
                      a first Download tap); Compress it stays in the row,
                      disabled until then, so the row doesn't jump in. */}
                  {selectedCount > 0 && status !== 'error' && (
                    <div class={styles['next-steps']}>
                      <PdfShareButton
                        visible={shareReady}
                        onShare={handleShare}
                        label={outputs.length === 1 ? 'Share PDF' : `Share ${outputs.length} PDFs`}
                        className={styles['next-step']}
                      />
                      {mode === 'combined' && (
                        <button
                          type="button"
                          class={styles['next-step']}
                          disabled={handoffBusy || !combinedOutput}
                          onClick={() => { void handoffToCompress(); }}
                        >
                          <Shrink size={16} aria-hidden="true" />
                          Compress it
                        </button>
                      )}
                    </div>
                  )}

                  {handoffFailed && (
                    <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">
                      Could not hand the file to Compress. Download it and open Compress instead.
                    </p>
                  )}
                </div>

                {status === 'error' && (
                  <ErrorMessage>
                    The split failed. Make sure the file is not encrypted or damaged.
                  </ErrorMessage>
                )}
              </aside>
            </div>
          )}
        </div>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
