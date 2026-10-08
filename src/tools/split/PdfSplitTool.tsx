import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Shrink } from 'lucide-preact';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { pageNumbersToRangeString, splitPdf, outputBaseName } from './split.js';
import { parsePageSelector } from '../../lib/pageSelector.js';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import styles from './PdfSplitTool.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ProgressRing from '../../shell/ProgressRing.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { useUndoChip } from '../../lib/useUndoChip.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import { useNavigatingAway } from '../../lib/useNavigatingAway.ts';
import { describeFile, formatFileSize, isolateLtr } from '../../lib/format.js';
import { getPdfRenderContext } from '../../lib/pdfRender.js';
import { PDFJS_WASM_URL } from '../../lib/pdfjsWasm.js';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import {
  englishShellMessages,
  englishSplitMessages,
  formatMessage,
  type ShellMessages,
  type SplitMessages,
} from '../../i18n/toolMessages';

/** Fills a sentence that holds one non-text node (a link, a <bdi>) at `{slot}`. */
function withSlot(template: string, slot: string, node: any) {
  const [before, after] = template.split(slot);
  return <>{before}{node}{after}</>;
}

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
  /** Server-rendered by src/pages/[locale]/[tool].astro for a localized
   * edition; every key not overridden keeps the English default. */
  messages?: Partial<SplitMessages>;
  shellMessages?: Partial<ShellMessages>;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

export default function PdfSplitTool({
  messages: messagesProp,
  shellMessages,
  navigate = (href) => { window.location.href = href; },
}: PdfSplitToolProps = {}) {
  const t: SplitMessages = { ...englishSplitMessages, ...messagesProp };
  const sm: ShellMessages = { ...englishShellMessages, ...shellMessages };
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
  /** A protected PDF is a precondition, not a failure (DEBT-41): no prepare run, nothing reported. */
  const [isProtected, setIsProtected] = useState(false);
  const [handoffBusy, setHandoffBusy] = useNavigatingAway();
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
  /** The Compress hand-off awaits too (DEBT-19): a new file must abandon it. */
  const handoffRun = useLatestRun();
  /** A tap on the element while it was still preparing: deliver on ready. */
  const pendingTap = useRef(false);
  // A Download tap during 'preparing' waits on this build, so hold through all of
  // it; an untapped prepare only delays an update by a moment.
  useHoldUpdate(status === 'preparing');
  useHoldUpdate(file !== null, 'open');
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

  // The single-slot undo chip Merge shares. Rotate is the only action that
  // uses it today; a new file clears it so a stale undo never runs on it.
  const { action: undoAction, register: registerUndo, clear: clearUndo, run: runUndo } = useUndoChip();

  // Any edit invalidates the prepared output; the idle prepare below rebuilds it.
  const invalidate = () => {
    prepareSeq.current += 1;
    pendingTap.current = false;
    clearPrepared();
    setSaved(false);
    // A hand-off still reading the old bytes must not park them or navigate,
    // and its button comes back for the newly chosen file.
    handoffRun.invalidate();
    setHandoffBusy(false);
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
    if (!file || isProtected || status === 'loading') return;
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
        reportError('pdf_tool_run', err, 'prepare_split');
        console.error(err);
        setStatus('error');
        setAnnouncement(t.announcePrepareFailed);
      }
    }, PREPARE_DELAY_MS);
    return () => clearTimeout(timer);
    // selectedPages and rotationKey are derived from pages; the joins key
    // the effect on the actual selection and rotation, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, isProtected, mode, selectedPages.join(','), rotationKey, status === 'loading']);

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
      let protection = 'open';
      try {
        protection = await probeEncryption(bytes);
      } catch (err) {
        // The probe itself failing says nothing about the file; load as today.
        if (!run.isCurrent()) return;
        reportError('pdf_tool_run', err, 'check_encryption');
      }
      if (!run.isCurrent()) return;
      if (protection === 'needs-password' || protection === 'owner-restricted') {
        setIsProtected(true);
        setStatus('error');
        setAnnouncement(t.announceProtected);
        run.settle();
        return;
      }
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
      setAnnouncement(formatMessage(t.announceLoaded, { name: pdfFile.name, count: pageCount }));

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
          // A run that lost its file had its document destroyed under it.
          if (run.isCurrent()) reportError('pdf_render', err, 'render_thumbnail');
          console.error(`Error rendering thumbnail for page ${i}:`, err);
        }
      }

      run.settle();
    } catch (err) {
      console.error('Error loading PDF document:', err);
      if (!run.isCurrent()) return;
      reportError('pdf_render', err, 'load_document');
      setStatus('error');
      setAnnouncement(t.announceLoadFailed);
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
          // expected: an abandoned task failing to release is nothing the person can act on
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
    recordAction(file ? 'replace_file' : 'add_files');
    invalidate();
    clearUndo();
    setFile(picked);
    setIsProtected(false);
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

  // parsePageSelector's errors carry a code and params so this catalogue can
  // phrase them; anything else keeps its own message.
  const selectorErrorText = (err: any): string => {
    const template = err?.code ? (t as any)[err.code] : undefined;
    return template ? formatMessage(template, err.params ?? {}) : err.message;
  };

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
      // expected: the person's own page range did not parse; its message is shown under the field.
      // While a selector is being typed ("1-" or "1,") hold the error.
      const isPartial = /[-,]\s*$/.test(value);
      setPageSelectorError(isPartial ? '' : selectorErrorText(err));
    }
    recordAction('select_pages');
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
    recordAction('select_pages');
  };

  // Rotation is a page property, not a selection one: it applies in either
  // mode, and toggling a page out and back in keeps whatever rotation it had.
  const rotatePage = (pageNumber: number) => {
    invalidate();
    setPages((prev) =>
      prev.map((p) => (p.pageNumber === pageNumber ? { ...p, rotation: (p.rotation + 90) % 360 } : p)),
    );
    setAnnouncement(formatMessage(t.announceRotated, { number: pageNumber }));
    recordAction('rotate');
    registerUndo(formatMessage(t.undoRotated, { number: pageNumber }), () => {
      invalidate();
      setPages((prev) =>
        prev.map((p) => (p.pageNumber === pageNumber ? { ...p, rotation: (p.rotation + 270) % 360 } : p)),
      );
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
    recordAction('select_pages');
  };

  const selectNone = () => {
    invalidate();
    setPages((prev) => prev.map((p) => ({ ...p, selected: false })));
    setPageSelector('');
    setPageSelectorError('');
    recordAction('select_pages');
  };

  const chooseMode = (next: Mode) => {
    if (next === mode) return;
    invalidate();
    setMode(next);
    recordAction('change_setting');
    setAnnouncement(next === 'combined' ? t.announceCombined : t.announceSeparate);
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
      setAnnouncement(t.announcePreparingTap);
      return;
    }
    if (status !== 'ready' || outputs.length === 0) {
      event.preventDefault();
      return;
    }
    recordAction('download');
    if (mode === 'separate') {
      event.preventDefault();
      downloadAll(outputs);
    }
    setSaved(true);
    setAnnouncement(mode === 'combined' ? t.announceSavedOne : formatMessage(t.announceSavedMany, { count: outputs.length }));
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') recordAction('share');
    if (result.status === 'shared') setAnnouncement(t.announceShared);
    else if (result.status === 'canceled') setAnnouncement(t.announceShareCanceled);
    else if (result.status === 'error') setAnnouncement(t.announceShareError);
  };

  // Cross-tool hand-off (guideline §13): park the prepared bytes for Compress
  // and navigate. Only the single-file mode has one file to hand over.
  const handoffToCompress = async () => {
    const output = outputs[0];
    if (handoffBusy || mode !== 'combined' || !output) return;
    const run = handoffRun.begin();
    setHandoffBusy(true);
    setHandoffFailed(false);
    try {
      const { saveHandoff } = await import('../../lib/drafts/draftStore.js');
      if (!run.isCurrent()) return;
      const fileBytes = await output.blob.arrayBuffer();
      if (!run.isCurrent()) return;
      const ok = await saveHandoff('compress', {
        fileName: output.filename,
        fileType: 'application/pdf',
        fileBytes,
      });
      if (!run.isCurrent()) return;
      if (!ok) throw new Error('handoff');
      run.settle();
      navigate('/compress/');
    } catch {
      // expected: saveHandoff reports its own failure; a stale failure must not touch the new file UI
      if (!run.isCurrent()) return;
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

  const pageWord = (n: number) => (n === 1 ? t.pageOne : formatMessage(t.pageOther, { count: n }));
  const fileWord = (n: number) => (n === 1 ? t.pdfOne : formatMessage(t.pdfOther, { count: n }));
  // A page range ("1-3, 5") inside right-to-left text keeps its digits in
  // reading order; left-to-right pages need no wrapper.
  // A file size ("1.0 MB") is isolated the same way (LRI ... PDI) inside a catalogue string.
  const rangeNode = (range: string) => (t.dir === 'rtl' ? <bdi dir="ltr">{range}</bdi> : range);

  const canvasHeading = mode === 'combined'
    ? (
      <>
        extracted_<bdi class={styles['output-name']}>{baseName}</bdi>
        <span class={styles['output-ext']}>.pdf</span>
      </>
    )
    : formatMessage(t.headingSeparate, { files: fileWord(selectedCount) });
  const canvasCount = formatMessage(t.pageCountOf, { selected: selectedCount, pages: pageWord(numPages) });

  const renderCell = (p: SplitPage) => (
    <div
      key={p.pageNumber}
      class={`${styles.cell}${p.selected ? '' : ` ${styles['is-out']}`}${perCellCaptions && p.selected ? ` ${styles['is-own-file']}` : ''}`}
      onClick={() => togglePageSelection(p.pageNumber)}
      role="checkbox"
      aria-checked={p.selected}
      aria-label={formatMessage(t.pageAria, { number: p.pageNumber })}
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
        aria-label={formatMessage(t.rotateAria, { number: p.pageNumber })}
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
        <span class={styles['cell-caption']} dir="ltr" title={`${baseName}-page-${p.pageNumber}.pdf`}>
          {'…-page-'}{p.pageNumber}<span class={styles['output-ext']}>.pdf</span>
        </span>
      ) : (
        <span class={styles['cell-number']}>{formatMessage(t.pageCell, { number: p.pageNumber })}</span>
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
      fileMeta={describeFile(file, numPages, undefined, sm)}
      shellMessages={shellMessages}
    >
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: rejectedFiles[0] })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {hasFiles && (
        <div class="tool-workspace">
          {status === 'loading' ? (
            <div class={pdfToolStyles['status-block']}>
              <p class={pdfToolStyles['status-text-muted']}>{t.loadingPages}</p>
            </div>
          ) : isProtected ? (
            <ErrorMessage>
              {withSlot(t.protectedBody, '{unlock}', <a href="/unlock/">{t.unlockLink}</a>)}
            </ErrorMessage>
          ) : (
            <div class={styles.stage}>
              {/* The heading names the output and spans both columns, so the
                  canvas frame and the rail start on the same line (Shlomi,
                  2026-09-14: the two boxes were not top-aligned). */}
              <div class={styles['canvas-head']}>
                <h3 id="split-canvas-title" class={styles['canvas-title']}>{canvasHeading}</h3>
                <span class={styles['canvas-count']}>{canvasCount}</span>
                {renderedCount < numPages && (
                  <span class={styles['canvas-status']} role="status">{formatMessage(t.rendering, { done: renderedCount, total: numPages })}</span>
                )}
                {undoAction && (
                  <span class={styles['undo-chip']} role="status">
                    {undoAction.message}
                    <button type="button" onClick={runUndo}>{t.undo}</button>
                  </span>
                )}
              </div>

              {/* The canvas: the output, as the person will get it. */}
              <section class={styles.canvas} aria-label={t.canvasLabel}>
                {mode === 'combined' ? (
                  <div class={styles['doc-frame']} data-empty={selectedCount === 0 ? 'true' : undefined}>
                    <div class={styles['frame-caption']}>
                      <span>{t.frameOneDocument}</span>
                      <span class={styles['frame-caption-note']}>
                        {selectedCount === 0
                          ? t.pickAtLeastOne
                          : withSlot(selectedCount === 1 ? t.frameNoteOne : t.frameNoteMany, '{range}', rangeNode(pageNumbersToRangeString(selectedPages)))}
                      </span>
                    </div>
                    <div class={styles.grid} data-scale={numPages <= 8 ? 'large' : undefined}>{pages.map(renderCell)}</div>
                  </div>
                ) : (
                  <div class={styles['doc-frames']}>
                    <div class={styles['frame-caption']}>
                      <span>{t.frameSeparate}</span>
                      <span class={styles['frame-caption-note']}>
                        {selectedCount === 0
                          ? t.pickAtLeastOne
                          : withSlot(t.eachSavesAs, '{name}', <bdi dir="ltr">{baseName}-page-N.pdf</bdi>)}
                      </span>
                    </div>
                    <div class={styles.grid} data-scale={numPages <= 8 ? 'large' : undefined}>{pages.map(renderCell)}</div>
                  </div>
                )}

                <p class={styles['canvas-hint']}>
                  {selectedCount === numPages ? t.hintAllIn : t.hintSomeOut}
                </p>

              </section>

              {/* The rail: commands on the selection, the setting, the primary control. */}
              <aside class={styles.rail} aria-label={t.railLabel}>
                <div class={styles.commands}>
                  <div class={pdfToolStyles['page-selector-field']}>
                    <div class={styles['command-row']}>
                      <label for="page-selector-input" class={pdfToolStyles['page-selector-label']}>{t.pagesLabel}</label>
                      <button type="button" class={styles.command} onClick={selectAll}>{t.selectAll}</button>
                      <button type="button" class={styles.command} onClick={selectNone}>{t.clear}</button>
                    </div>
                    <input
                      id="page-selector-input"
                      type="text"
                      class={`${pdfToolStyles['page-selector-input']}${pageSelectorError ? ` ${pdfToolStyles['has-error']}` : ''}`}
                      value={pageSelector}
                      onInput={(e) => handlePageSelectorChange((e.target as HTMLInputElement).value)}
                      dir="ltr"
                      placeholder={t.pageSelectorPlaceholder}
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
                      aria-label={t.modeGroupLabel}
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
                          {m === 'combined' ? t.modeCombined : t.modeSeparate}
                        </button>
                      ))}
                    </div>
                    <p class={styles['setting-note']}>
                      {mode === 'combined' ? t.modeNoteCombined : t.modeNoteSeparate}
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
                      <span class={styles['primary-label']}>{t.pickAtLeastOne}</span>
                    ) : primaryState === 'preparing' ? (
                      <ProgressRing progress={progress} label={formatMessage(t.preparing, { pages: pageWord(selectedCount) })} />
                    ) : primaryState === 'error' ? (
                      <span class={styles['primary-label']}>{t.cannotPrepare}</span>
                    ) : primaryState === 'saved' ? (
                      <>
                        <svg class={styles['primary-check']} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" class={pdfToolStyles['check-circle']} />
                          <path d="M7.5 12.5l3 3 6-6.5" class={pdfToolStyles['check-mark']} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                        </svg>
                        <span class={styles['primary-label']}>
                          {mode === 'combined' ? t.saved : formatMessage(t.savedMany, { files: fileWord(outputs.length) })}
                        </span>
                        <span class={styles['primary-detail']}>{t.downloadAgain}</span>
                      </>
                    ) : (
                      <>
                        <span class={styles['primary-label']}>
                          {mode === 'combined' ? t.downloadOne : formatMessage(t.downloadMany, { files: fileWord(outputs.length) })}
                        </span>
                        <span class={styles['primary-detail']}>
                          {mode === 'combined'
                            ? formatMessage(t.detailCombined, { pages: pageWord(selectedCount), size: isolateLtr(formatFileSize(totalBytes), t.dir) })
                            : formatMessage(t.detailSeparate, { size: isolateLtr(formatFileSize(totalBytes), t.dir) })}
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
                      a first Download tap); Compress stays in the row,
                      disabled until then, so the row doesn't jump in. */}
                  {selectedCount > 0 && status !== 'error' && (
                    <div class={styles['next-steps']}>
                      <PdfShareButton
                        visible={shareReady}
                        onShare={handleShare}
                        label={outputs.length === 1 ? t.shareOne : formatMessage(t.shareMany, { count: outputs.length })}
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
                          {t.compress}
                        </button>
                      )}
                    </div>
                  )}

                  {handoffFailed && (
                    <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">
                      {t.handoffFailed}
                    </p>
                  )}
                </div>

                {status === 'error' && (
                  <ErrorMessage>
                    {withSlot(t.splitFailedBody, '{unlock}', <a href="/unlock/">{t.unlockLink}</a>)}
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
