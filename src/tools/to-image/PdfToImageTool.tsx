import type { ComponentType } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { convertPdfToImages } from './toImage.js';
import { PageSelectorError, parsePageSelector, pageNumbersToRangeString } from '../../lib/pageSelector.js';
import { createQuietPreparer, type QuietPolicy } from '../../lib/quietPrepare.ts';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import ToolShell, { FileActions } from '../../shell/ToolShell.tsx';
import PdfToImageVerb from './verb/PdfToImageVerb.tsx';
import OptionRow from './OptionRow.tsx';
import styles from './PdfToImageTool.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ProgressRing from '../../shell/ProgressRing.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import type { PreviewTarget, PreviewToggle, PreviewMessages } from '../../shell/PagePreviewDialog.tsx';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import { describeFile, formatFileSize, isolateLtr } from '../../lib/format.js';
import {
  englishToImageMessages,
  formatMessage,
  type ShellMessages,
  type ToImageMessages,
} from '../../i18n/toolMessages';

const scaleOptions = (t: ToImageMessages) => [
  { value: 1, label: t.qualityStandard, hint: t.qualityStandardHint },
  { value: 2, label: t.qualityHigh, hint: t.qualityHighHint },
  { value: 3, label: t.qualityMaximum, hint: t.qualityMaximumHint },
];
const formatOptions = (t: ToImageMessages) => [
  { value: 'image/png', label: 'PNG', hint: t.formatPngHint },
  { value: 'image/jpeg', label: 'JPG', hint: t.formatJpgHint },
];
const layoutOptions = (t: ToImageMessages) => [
  { value: 'separate', label: t.layoutSeparate, hint: t.layoutSeparateHint },
  { value: 'concatenated', label: t.layoutCombined, hint: t.layoutCombinedHint },
];

/** Above this many selected pages the conversion is not started in the
 * background: rendering them all is heavy, so it waits for the person heading
 * for Download (hover, focus, pointer down) or tapping it. */
const AUTO_BUILD_PAGE_LIMIT = 30;

/** Width of a page tile's thumbnail in device pixels. */
const THUMBNAIL_WIDTH = 200;

interface ImagePage {
  pageNumber: number;
  selected: boolean;
  thumbnail: string | null;
}

interface OutputImage {
  pageNumber: number;
  filename: string;
  blob: Blob;
  url: string;
}

/** idle: no file. loading: reading the PDF. preparing: the person tapped
 * Download or Share before the quiet-time build finished (the build itself is
 * silent: Download keeps its ready look). ready: Download is offered.
 * error: the last conversion failed. */
type Status = 'idle' | 'loading' | 'preparing' | 'ready' | 'error';

function revokeAll(images: OutputImage[]) {
  for (const image of images) URL.revokeObjectURL(image.url);
}

export interface PdfToImageToolProps {
  /** Server-rendered by src/pages/[locale]/[tool].astro for a localized
   * edition; every key not overridden keeps the English default. */
  messages?: Partial<ToImageMessages>;
  shellMessages?: Partial<ShellMessages>;
  /** Tests only: shortens the quiet wait before the background build. */
  quietPolicy?: QuietPolicy;
}

export default function PdfToImageTool({ messages: messagesProp, shellMessages, quietPolicy }: PdfToImageToolProps = {}) {
  const t: ToImageMessages = { ...englishToImageMessages, ...messagesProp };
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pages, setPages] = useState<ImagePage[]>([]);
  const [format, setFormat] = useState('image/png');
  const [scale, setScale] = useState(2);
  const [layout, setLayout] = useState('separate');
  const [pageSelector, setPageSelector] = useState('');
  const [pageSelectorError, setPageSelectorError] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  /** The PDF itself could not be read. Its own state, so the build effect (which sees 0 selected pages) can never overwrite it with 'ready'. */
  const [loadError, setLoadError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputs, setOutputs] = useState<OutputImage[]>([]);
  const [saved, setSaved] = useState(false);
  // Analytics follows intent: the person's Download or Share is the start; the
  // background build is not counted (as in Split).
  const [tap, setTap] = useState<'idle' | 'processing' | 'done'>('idle');
  const [announcement, setAnnouncement] = useState('');
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [PreviewDialog, setPreviewDialog] = useState<ComponentType<{
    target: PreviewTarget | null; onClose: () => void; onStep: (delta: 1 | -1) => void;
    toggle?: PreviewToggle; messages: PreviewMessages;
  }> | null>(null);
  const { shareReady, prepareFiles, clearPrepared, sharePrepared } = usePdfShare();

  const primaryRef = useRef<HTMLAnchorElement | null>(null);
  /** Quiet-time preparer (src/lib/quietPrepare.ts), one per opened file so a new file starts with an empty cache. */
  const preparerRef = useRef<ReturnType<typeof createQuietPreparer<any[]>> | null>(null);
  /** The key of the state on screen; a result for any other key is dropped. */
  const keyRef = useRef<string | null>(null);
  /** What the next build reads; always the inputs of the current key. */
  const inputsRef = useRef<{ file: File | null; format: string; scale: number; layout: string; pages: number[] }>({
    file: null, format: 'image/png', scale: 2, layout: 'separate', pages: [],
  });
  /** The document load is its own race: picking a second file abandons it. */
  const loadRun = useLatestRun();
  /** A tap while the build was still going: deliver on ready. */
  const pendingTap = useRef(false);
  // A Download tap during 'preparing' waits on this build, so hold through all of it.
  useHoldUpdate(status === 'preparing');
  useHoldUpdate(file !== null, 'open');
  const outputsRef = useRef<OutputImage[]>([]);
  outputsRef.current = outputs;

  const selectedPages = pages.filter((p) => p.selected).map((p) => p.pageNumber);
  const selectedCount = selectedPages.length;
  const renderedCount = pages.filter((p) => p.thumbnail).length;
  const isTall = layout === 'concatenated';
  const singlePage = numPages === 1;
  inputsRef.current = { file, format, scale, layout, pages: selectedPages };

  useEffect(() => () => revokeAll(outputsRef.current), []);

  // Any edit invalidates the built images; the quiet-time build below redoes them.
  const invalidate = () => {
    pendingTap.current = false;
    clearPrepared();
    setSaved(false);
    setTap('idle');
    setOutputs((prev) => {
      revokeAll(prev);
      return [];
    });
  };

  // Guideline §2, "Quiet means quiet": the build waits for the person to go
  // quiet and runs silently - Download keeps its ready look meanwhile. Only a
  // tap on Download or Share before it lands shows 'preparing'. A new file gets
  // a new preparer (and so an empty cache); unmount disposes it.
  useEffect(() => {
    const preparer = createQuietPreparer<any[]>({
      policy: quietPolicy,
      build: (_key, signal) => {
        const { file: f, format: fmt, scale: sc, layout: lay, pages: wanted } = inputsRef.current;
        setProgress(0);
        return convertPdfToImages(f, {
          format: fmt,
          scale: sc,
          layout: lay,
          pages: pageNumbersToRangeString(wanted),
          signal,
          onProgress: (value: number) => { if (!signal.aborted) setProgress(value); },
        } as any);
      },
      onReady: (key, results) => {
        if (key !== keyRef.current) return;
        const next: OutputImage[] = results.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }));
        setOutputs((prev) => {
          revokeAll(prev);
          return next;
        });
        prepareFiles(results.map(({ blob, filename }) => ({ blob, filename, type: blob.type })));
        setStatus('ready');
      },
      onError: (key, err: any) => {
        // expected: a superseded build is aborted on purpose and is not a failure
        if (err?.name === 'AbortError' || key !== keyRef.current) return;
        console.error(err);
        reportError('pdf_tool_run', err, 'convert');
        pendingTap.current = false;
        setTap('idle');
        setStatus('error');
      },
    });
    preparerRef.current = preparer;
    return () => {
      preparer.dispose();
      if (preparerRef.current === preparer) preparerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    if (!file || status === 'loading' || loadError) return;
    if (selectedCount === 0) {
      keyRef.current = null;
      preparerRef.current?.dispose();
      setStatus('ready');
      return;
    }
    const key = `${format}|${scale}|${layout}|${selectedPages.join(',')}`;
    keyRef.current = key;
    setStatus('ready');
    if (selectedCount > AUTO_BUILD_PAGE_LIMIT) {
      // dispose() only cancels: it drops a pending or running build for the old
      // selection. The conversion for this one starts when the person heads for
      // Download (requestNow below).
      preparerRef.current?.dispose();
    } else {
      preparerRef.current?.change(key);
    }
    // selectedPages is derived from pages; the join keys the effect on the
    // actual selection, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, format, scale, layout, selectedPages.join(','), status === 'loading', loadError]);

  /** Heading for Download or Share: start the build now (a large selection starts here only). */
  const requestNow = () => {
    const preparer = preparerRef.current;
    if (!preparer || !file || selectedCount === 0 || status === 'loading' || status === 'error' || loadError || outputs.length > 0) return;
    // Nothing built, nothing building, nothing queued (a large selection, or an
    // edit that dropped the images without changing the key): queue it now.
    if (keyRef.current && !preparer.building && preparer.pendingKey === null) {
      preparer.change(keyRef.current);
    }
    preparer.now();
  };

  // No zip dependency is used (keeps the reviewed-permissive-license + zero-network constraint
  // simple) - multi-page output downloads each image sequentially instead.
  const downloadAll = (list: OutputImage[]) => {
    list.forEach((image, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = image.url;
        link.download = image.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 200);
    });
  };

  // A tap while the build was going delivers on ready.
  useEffect(() => {
    if (status !== 'ready' || !pendingTap.current || outputs.length === 0) return;
    pendingTap.current = false;
    if (outputs.length === 1) primaryRef.current?.click();
    else {
      recordAction('download');
      downloadAll(outputs);
      setSaved(true);
      setAnnouncement(t.announceReady);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, outputs]);

  // A tap on a ready Download or a share: 'processing' renders once so
  // BasePdfTool reports the start, then 'done'.
  useEffect(() => {
    if (tap === 'processing' && !pendingTap.current && status === 'ready') setTap('done');
  }, [tap, status, outputs]);

  const loadDocument = async (pdfFile: File) => {
    const run = loadRun.begin();
    let source: any = null;
    try {
      // Lazy: pdf.js stays out of the eager graph until a file is picked.
      const { openThumbnailSource } = await import('../../lib/thumbnails.js');
      source = await openThumbnailSource(pdfFile);
      if (!run.isCurrent()) return;
      const pageCount: number = source.pageCount;
      const initial = Array.from({ length: pageCount }, (_, idx) => ({ pageNumber: idx + 1, selected: true, thumbnail: null }));
      setNumPages(pageCount);
      setPages(initial);
      setPageSelector(pageNumbersToRangeString(initial.map((p) => p.pageNumber)));
      setStatus('ready');
      for (let i = 1; i <= pageCount; i += 1) {
        if (!run.isCurrent()) return;
        try {
          const url: string = await source.render(i - 1, { width: THUMBNAIL_WIDTH });
          if (!run.isCurrent()) return;
          setPages((current) => current.map((p) => (p.pageNumber === i ? { ...p, thumbnail: url } : p)));
        } catch (err) {
          // A run that lost its file had its document destroyed under it.
          if (run.isCurrent()) reportError('pdf_render', err, 'render_thumbnail');
          console.error(`Error rendering thumbnail for page ${i}:`, err);
        }
      }
      run.settle();
    } catch (err: any) {
      console.error('Error loading PDF document:', err);
      if (!run.isCurrent()) return;
      // expected: a password-protected PDF is the person's file, not our failure
      if (err?.name !== 'PasswordException') reportError('pdf_render', err, 'load_document');
      setLoadError(true);
      setStatus('ready');
    } finally {
      if (source) {
        try {
          await source.destroy();
        } catch {
          // expected: an abandoned document failing to release is nothing the person can act on
        }
      }
    }
  };

  const handleFilesAdded = (fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf');
    if (pdfs.length === 0) return;
    recordAction(file ? 'replace_file' : 'add_files');
    invalidate();
    setFile(pdfs[0]);
    setPages([]);
    setNumPages(0);
    setPageSelector('');
    setPageSelectorError('');
    setLoadError(false);
    setStatus('loading');
    void loadDocument(pdfs[0]);
  };

  // SITE-42: files picked on the home page arrive as a hand-off, collected on
  // mount and sent down the same path a manual pick takes. This tool restores
  // nothing on mount, so there is no restore to race - see useHandoffIntake.ts.
  useHandoffIntake('pdf-to-image', (f) => handleFilesAdded([f]));

  // parsePageSelector's errors carry a code and params so this catalogue can
  // phrase them; anything else keeps its own message.
  const selectorErrorText = (err: any): string => {
    const template = err?.code ? (t as any)[err.code] : undefined;
    return template ? formatMessage(template, err.params ?? {}) : err.message;
  };

  const handlePageSelectorChange = (value: string) => {
    setPageSelector(value);
    try {
      const parsed = parsePageSelector(value, numPages);
      // An edit that leaves the selection as it was ("," typed then removed)
      // keeps the images already built.
      if (parsed.join(',') !== selectedPages.join(',')) {
        invalidate();
        setPages((prev) => prev.map((p) => ({ ...p, selected: parsed.includes(p.pageNumber) })));
      }
      setPageSelectorError('');
    } catch (err: any) {
      // expected: the person's own page range did not parse; its message is shown under the field.
      // While a selector is being typed ("1-" or "1,") hold the error.
      const isPartial = /[-,]\s*$/.test(value);
      setPageSelectorError(isPartial || !(err instanceof PageSelectorError) ? '' : selectorErrorText(err));
    }
    recordAction('select_pages');
  };

  // A toggled tile stays where it is: membership is shown by state (dimmed,
  // dashed, marked), never by moving the tile, so the next tap lands on the
  // page the finger is over.
  const togglePageSelection = (pageNumber: number) => {
    if (singlePage) return;
    invalidate();
    setPages((prev) => {
      const next = prev.map((p) => (p.pageNumber === pageNumber ? { ...p, selected: !p.selected } : p));
      setPageSelector(pageNumbersToRangeString(next.filter((p) => p.selected).map((p) => p.pageNumber)));
      setPageSelectorError('');
      return next;
    });
    recordAction('select_pages');
  };

  // The dialog is a lazy chunk: it stays out of the eager graph until a
  // magnifier is pressed (npm run test:lazy-modules).
  const openPreview = (pageNumber: number) => {
    setPreviewPage(pageNumber);
    if (!PreviewDialog) {
      import('../../shell/PagePreviewDialog.tsx')
        .then((module) => setPreviewDialog(() => module.default))
        .catch((err) => { reportError('chunk_load', err, 'import_preview_dialog'); });
    }
  };

  const changeSetting = <T,>(current: T, next: T, set: (value: T) => void) => {
    if (next === current) return;
    invalidate();
    set(next);
    recordAction('change_setting');
  };

  const onPrimaryClick = (event: MouseEvent) => {
    if (selectedCount === 0 || status === 'loading') {
      event.preventDefault();
      return;
    }
    if (status === 'error' && !loadError && preparerRef.current && keyRef.current) {
      // The last build failed: a tap tries it again, now.
      event.preventDefault();
      pendingTap.current = true;
      setTap('processing');
      setStatus('preparing');
      setAnnouncement(t.announcePreparingTap);
      preparerRef.current.change(keyRef.current);
      preparerRef.current.now();
      return;
    }
    if (status === 'preparing' || (status === 'ready' && outputs.length === 0)) {
      // The build has not landed: show it now and deliver on ready.
      event.preventDefault();
      pendingTap.current = true;
      setTap('processing');
      if (status !== 'preparing') setStatus('preparing');
      setAnnouncement(t.announcePreparingTap);
      requestNow();
      return;
    }
    if (status !== 'ready' || outputs.length === 0) {
      event.preventDefault();
      return;
    }
    recordAction('download');
    setTap('processing');
    if (outputs.length > 1) {
      event.preventDefault();
      downloadAll(outputs);
    }
    setSaved(true);
    setAnnouncement(t.announceReady);
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') {
      recordAction('share');
      setTap('processing');
      setAnnouncement(t.announceShared);
    } else if (result.status === 'canceled') setAnnouncement(t.announceShareCanceled);
    else if (result.status === 'error') setAnnouncement(t.announceShareError);
  };

  const hasFiles = !!file;
  const failed = status === 'error' || loadError;
  const formatLabel = format === 'image/jpeg' ? 'JPG' : 'PNG';
  const expectedCount = isTall ? 1 : selectedCount;
  const imageCount = outputs.length || expectedCount;
  const totalBytes = outputs.reduce((sum, image) => sum + image.blob.size, 0);
  const primaryState = loadError ? 'error'
    : status === 'loading' || selectedCount === 0
      ? 'empty'
      : status === 'preparing' ? 'preparing'
        : status === 'error' ? 'error'
          : saved ? 'saved' : 'ready';
  const primaryIsLink = outputs.length === 1 && (primaryState === 'ready' || primaryState === 'saved');
  const primaryText = imageCount === 1
    ? formatMessage(t.downloadOne, { format: formatLabel })
    : formatMessage(t.downloadMany, { count: imageCount, format: formatLabel });
  const sizeText = outputs.length > 0 ? isolateLtr(formatFileSize(totalBytes), t.dir) : '';
  const imageFor = (pageNumber: number) => outputs.find((image) => image.pageNumber === pageNumber);

  const renderTile = (p: ImagePage) => {
    const image = !isTall && p.selected ? imageFor(p.pageNumber) : undefined;
    return (
      <div
        key={p.pageNumber}
        class={`${styles.tile}${p.selected ? '' : ` ${styles['is-out']}`}`}
        onClick={() => togglePageSelection(p.pageNumber)}
        role="checkbox"
        aria-checked={p.selected}
        aria-label={formatMessage(t.pageRow, { number: p.pageNumber })}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            togglePageSelection(p.pageNumber);
          }
        }}
      >
        <div class={styles['tile-art']}>
          <div class={styles['tile-thumb']}>
            {p.thumbnail ? (
              <img class={styles['tile-thumb-img']} src={p.thumbnail} alt="" />
            ) : (
              <div class={`${pdfToolStyles['thumb-placeholder']} ${pdfToolStyles['thumb-placeholder-fill']}`} />
            )}
          </div>
          {image && (
            <a
              class={styles['tile-download']}
              href={image.url}
              download={image.filename}
              aria-label={formatMessage(t.downloadPageAria, { number: p.pageNumber })}
              onClick={(e) => { e.stopPropagation(); recordAction('download'); setTap('processing'); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 4v11" />
                <path d="M7 11l5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
            </a>
          )}
          <button
            type="button"
            class={styles['preview-btn']}
            aria-label={formatMessage(t.openPreview, { number: p.pageNumber })}
            onClick={(e) => { e.stopPropagation(); openPreview(p.pageNumber); }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.3 10.3L14 14" />
            </svg>
          </button>
        </div>
        {(!isTall || !p.selected) && (
          <span class={styles['tile-caption']}>
            {!isTall && <span>{formatMessage(t.pageRow, { number: p.pageNumber })}</span>}
            {!p.selected && <span class={styles['out-mark']}>{t.tileLeftOut}</span>}
          </span>
        )}
      </div>
    );
  };

  const resultSection = (
    <section class={styles.result} aria-label={t.pagesLabel}>
      {status === 'loading' ? (
        <p class={styles['result-status']}>{t.loadingPages}</p>
      ) : (
        <>
          {isTall ? (
            <div class={styles.tall}>
              <span class={styles['tall-caption']}>
                {selectedCount === 1 ? t.tallCaptionOne : formatMessage(t.tallCaptionMany, { count: selectedCount })}
              </span>
              <div class={styles['tall-column']}>{pages.map(renderTile)}</div>
            </div>
          ) : (
            <div class={styles.grid} data-scale={numPages <= 8 ? 'large' : undefined} data-single={singlePage ? 'true' : undefined}>{pages.map(renderTile)}</div>
          )}
          {pages.length > 1 && (
            <p class={styles['result-hint']}>{selectedCount === numPages ? t.hintAllIn : t.hintSomeOut}</p>
          )}
          {pages.length > 0 && renderedCount < numPages && <span class="sr-only" role="status">{t.loadingPages}</span>}
        </>
      )}
    </section>
  );

  const sheet = (
    <div
      class={`${styles['result-action']} ${styles['result-sheet']}`}
      onPointerEnter={requestNow}
      onFocusIn={requestNow}
      onPointerDown={requestNow}
    >
      <a
        ref={primaryRef}
        class={styles.primary}
        data-state={primaryState}
        href={primaryIsLink ? outputs[0].url : undefined}
        download={primaryIsLink ? outputs[0].filename : undefined}
        role={primaryIsLink ? undefined : 'button'}
        tabIndex={0}
        aria-label={primaryState === 'ready' || primaryState === 'saved' ? (sizeText ? formatMessage(t.downloadDetail, { label: primaryText, size: sizeText }) : primaryText) : undefined}
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
          <span class={styles['primary-label']}>{status === 'loading' ? t.loadingPages : t.pickAtLeastOne}</span>
        ) : primaryState === 'preparing' ? (
          <ProgressRing progress={progress} label={t.converting} />
        ) : primaryState === 'error' ? (
          <span class={styles['primary-label']}>{t.cannotConvert}</span>
        ) : (
          <>
            {primaryState === 'saved' && (
              <svg class={styles['primary-check']} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" class={pdfToolStyles['check-circle']} />
                <path d="M7.5 12.5l3 3 6-6.5" class={pdfToolStyles['check-mark']} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
            )}
            <span class={styles['primary-label']}>{primaryText}</span>
            <span class={styles['primary-detail']}>{sizeText}</span>
          </>
        )}
      </a>

      {selectedCount > 0 && !failed && (
        <PdfShareButton
          visible={shareReady}
          onShare={handleShare}
          label={outputs.length === 1 ? formatMessage(t.shareOne, { format: formatLabel }) : formatMessage(t.shareMany, { count: outputs.length })}
        />
      )}

      {failed && <ErrorMessage>{loadError ? t.convertFailed : t.buildFailed}</ErrorMessage>}
    </div>
  );

  return (
    <BasePdfTool
      emptyArt={<PdfToImageVerb />}
      hasFiles={hasFiles}
      analyticsTool="pdf-to-image"
      analyticsStatus={failed ? 'error' : tap}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      fileLabel={file?.name}
      file={file}
      fileMeta={describeFile(file, numPages || undefined, undefined, shellMessages)}
      shellMessages={shellMessages}
      hideIdentity
    >
      {hasFiles && (
        <div class={styles['loaded-layout']}>
          {/* The shell's own strip, placed here so a desktop shows it in the
              rail beside the pages (UX guidelines §18 rule 3). */}
          <div class={styles.strip}>
            <ToolShell flush>
              <FileActions />
            </ToolShell>
          </div>

          <div class={styles.controls}>
            <OptionRow
              id="format"
              label={t.formatLabel}
              options={formatOptions(t)}
              value={format}
              onChange={(next) => changeSetting(format, next, setFormat)}
              dir={t.dir}
            />
            <OptionRow
              id="quality"
              label={t.qualityLabel}
              options={scaleOptions(t)}
              value={scale}
              onChange={(next) => changeSetting(scale, next, setScale)}
              dir={t.dir}
            />
            <OptionRow
              id="layout"
              label={t.layoutLabel}
              options={layoutOptions(t)}
              value={layout}
              onChange={(next) => changeSetting(layout, next, setLayout)}
              dir={t.dir}
            />
            {!singlePage && (
            <div class={pdfToolStyles['page-selector-field']}>
              <label class={pdfToolStyles['page-selector-label']} for="page-selector-input">
                {t.pagesLabel}
              </label>
              <input
                id="page-selector-input"
                type="text"
                class={`${pdfToolStyles['page-selector-input']}${pageSelectorError ? ` ${pdfToolStyles['has-error']}` : ''}${t.dir === 'rtl' ? ` ${styles['page-selector-rtl']}` : ''}`}
                dir="ltr"
                placeholder={t.pageSelectorPlaceholder}
                value={pageSelector}
                onInput={(e) => handlePageSelectorChange(e.currentTarget.value)}
                aria-invalid={!!pageSelectorError}
                aria-describedby={pageSelectorError ? 'page-selector-error' : undefined}
              />
            </div>
            )}
            {pageSelectorError && (
              <p id="page-selector-error" class={pdfToolStyles['page-selector-error']} role="alert">
                {pageSelectorError}
              </p>
            )}
          </div>

          {resultSection}
          {sheet}
        </div>
      )}

      {PreviewDialog && file && (() => {
        const page = pages.find((p) => p.pageNumber === previewPage);
        const target: PreviewTarget | null = page ? {
          file,
          pageIndex: page.pageNumber - 1,
          rotation: 0,
          title: formatMessage(t.previewTitle, { number: page.pageNumber, total: numPages }),
          badge: page.selected ? undefined : t.previewLeftOut,
          atStart: page.pageNumber <= 1,
          atEnd: page.pageNumber >= numPages,
        } : null;
        return (
          <PreviewDialog
            target={target}
            onClose={() => setPreviewPage(null)}
            onStep={(delta) => setPreviewPage((current) => (current == null ? null : Math.max(1, Math.min(numPages, current + delta))))}
            toggle={page && !singlePage ? {
              label: page.selected ? t.previewLeaveOut : t.previewBringBack,
              pressed: !page.selected,
              always: true,
              onToggle: () => togglePageSelection(page.pageNumber),
            } : undefined}
            messages={{ close: t.previewClose, previous: t.previewPrev, next: t.previewNext, loading: t.previewLoading }}
          />
        );
      })()}
      <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
    </BasePdfTool>
  );
}
