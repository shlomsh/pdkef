import { useEffect, useRef, useState } from 'preact/hooks';
import { convertPdfToImages } from './toImage.js';
import { PageSelectorError } from '../../lib/pageSelector.js';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import styles from './PdfToImageTool.module.css';
import fileListStyles from '../../shell/FileList.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ProgressRing from '../../shell/ProgressRing.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import { useRevokeOnUnmount } from '../../lib/useObjectUrls.js';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import { describeFile } from '../../lib/format.js';
import {
  englishShellMessages,
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
const layoutOptions = (t: ToImageMessages) => [
  { value: 'separate', label: t.layoutSeparate },
  { value: 'concatenated', label: t.layoutCombined },
];

function revokeAll(images: any[]) {
  for (const image of images) URL.revokeObjectURL(image.url);
}

export interface PdfToImageToolProps {
  /** Server-rendered by src/pages/[locale]/[tool].astro for a localized
   * edition; every key not overridden keeps the English default. */
  messages?: Partial<ToImageMessages>;
  shellMessages?: Partial<ShellMessages>;
}

export default function PdfToImageTool({ messages: messagesProp, shellMessages }: PdfToImageToolProps = {}) {
  const t: ToImageMessages = { ...englishToImageMessages, ...messagesProp };
  const SCALE_OPTIONS = scaleOptions(t);
  const LAYOUT_OPTIONS = layoutOptions(t);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState('image/png');
  const [scale, setScale] = useState(2);
  const [layout, setLayout] = useState('separate');
  const [pageSelector, setPageSelector] = useState('');
  const [pageSelectorError, setPageSelectorError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | converting | done | error
  useHoldUpdate(status === 'converting');
  useHoldUpdate(file !== null, 'open');
  const [progress, setProgress] = useState(0);
  const [images, setImages] = useState<any[]>([]);
  useRevokeOnUnmount(images.map((i) => i.url));
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepareFiles, clearPrepared, sharePrepared } = usePdfShare();
  const downloadRef = useRef<any>(null);
  // DEBT-18: resetOutput is the single place every change that invalidates a
  // running conversion already goes through (a new file, a page selector,
  // format, scale or layout), so the cheap token form is enough here - no
  // keys to compare.
  const convertRun = useLatestRun();

  useEffect(() => {
    if (status === 'done' && downloadRef.current) {
      downloadRef.current.focus();
    }
  }, [status]);

  const resetOutput = () => {
    convertRun.invalidate();
    clearPrepared();
    setStatus('idle');
    setProgress(0);
    setImages((previous) => {
      revokeAll(previous);
      return [];
    });
  };

  const handleFilesAdded = (fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf');
    if (pdfs.length === 0) return;
    setFile(pdfs[0]);
    setPageSelector('');
    setPageSelectorError('');
    resetOutput();
    recordAction('add_files');
  };

  // SITE-42: files picked on the home page arrive as a hand-off, collected on
  // mount and sent down the same path a manual pick takes. This tool restores
  // nothing on mount, so there is no restore to race - see useHandoffIntake.ts.
  useHandoffIntake('pdf-to-image', (f) => handleFilesAdded([f]));

  const handlePageSelectorChange = (next: string) => {
    setPageSelector(next);
    setPageSelectorError('');
    resetOutput();
    recordAction('select_pages');
  };

  const handleFormatChange = (next: string) => {
    if (next === format) return;
    setFormat(next);
    resetOutput();
    recordAction('change_setting');
  };

  const handleScaleChange = (next: number) => {
    if (next === scale) return;
    setScale(next);
    resetOutput();
    recordAction('change_setting');
  };

  const handleLayoutChange = (next: string) => {
    if (next === layout) return;
    setLayout(next);
    resetOutput();
    recordAction('change_setting');
  };

  const handleConvert = async () => {
    if (!file) return;
    recordAction('export');
    setPageSelectorError('');
    setStatus('converting');
    setProgress(0);
    // Captured before the first await. The object URLs are deliberately
    // created after the check below, so a dropped run leaves none to revoke.
    const run = convertRun.begin();
    const sourceFile = file;
    try {
      const rendered: any[] = await convertPdfToImages(sourceFile, {
        format,
        scale,
        layout,
        pages: pageSelector,
        onProgress: (value: number) => {
          if (run.isCurrent()) setProgress(value);
        },
      } as any);
      if (!run.isCurrent()) return;
      run.settle();
      setImages(rendered.map((image) => ({ ...image, url: URL.createObjectURL(image.blob) })));
      prepareFiles(rendered.map(({ blob, filename }) => ({ blob, filename, type: blob.type })));
      setStatus('done');
      setAnnouncement(t.announceReady);
    } catch (err: any) {
      console.error(err);
      // A failure belonging to a file that is no longer loaded must not push
      // 'error' (or a page-selector error) onto the one that is.
      if (!run.isCurrent()) return;
      if (!(err instanceof PageSelectorError)) reportError('pdf_tool_run', err, 'convert');
      run.settle();
      if (err instanceof PageSelectorError) {
        setPageSelectorError(selectorErrorText(err));
        setStatus('idle');
      } else {
        setStatus('error');
      }
    }
  };

  // parsePageSelector's errors carry a code and params so this catalogue can
  // phrase them; anything else keeps its own message.
  const selectorErrorText = (err: any): string => {
    const template = err?.code ? (t as any)[err.code] : undefined;
    return template ? formatMessage(template, err.params ?? {}) : err.message;
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') recordAction('share');
    if (result.status === 'shared') setAnnouncement(t.announceShared);
    else if (result.status === 'canceled') setAnnouncement(t.announceShareCanceled);
    else if (result.status === 'error') setAnnouncement(t.announceShareError);
  };

  // No zip dependency is used (keeps the reviewed-permissive-license + zero-network constraint
  // simple) - multi-page output downloads each image sequentially instead.
  const downloadAll = () => {
    recordAction('download');
    images.forEach((image, index) => {
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

  const hasFiles = !!file;
  const formatLabel = format === 'image/jpeg' ? 'JPG' : 'PNG';

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool="pdf-to-image"
      analyticsStatus={status}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      fileLabel={file?.name}
      file={file}
      fileMeta={describeFile(file, undefined, undefined, shellMessages)}
      shellMessages={shellMessages}
    >
      {hasFiles && (
        <div class="tool-workspace">
          <div class={styles.toolbar} role="group" aria-label={t.formatGroupLabel}>
            <span class={styles['toolbar-label']}>{t.formatLabel}</span>
            <button
              type="button"
              aria-pressed={format === 'image/png'}
              onClick={() => handleFormatChange('image/png')}
            >
              PNG
            </button>
            <button
              type="button"
              aria-pressed={format === 'image/jpeg'}
              onClick={() => handleFormatChange('image/jpeg')}
            >
              JPG
            </button>
          </div>

          <div class={styles.toolbar} role="group" aria-label={t.qualityGroupLabel}>
            <span class={styles['toolbar-label']}>{t.qualityLabel}</span>
            {SCALE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={scale === option.value}
                onClick={() => handleScaleChange(option.value)}
              >
                {option.label}
              </button>
            ))}
            <span class={styles['info-icon']} tabIndex={0} aria-describedby="quality-tooltip">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9.25" stroke="currentColor" stroke-width="1.6" />
                <path d="M12 11v5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <circle cx="12" cy="7.75" r="1.05" fill="currentColor" />
              </svg>
              <span class={styles['tooltip-bubble']} role="tooltip" id="quality-tooltip">
                {SCALE_OPTIONS.map((option) => (
                  <span key={option.value} class={styles['tooltip-row']}>
                    <strong>{option.label}</strong> {option.hint}
                  </span>
                ))}
              </span>
            </span>
          </div>

          <div class={styles.toolbar} role="group" aria-label={t.layoutGroupLabel}>
            <span class={styles['toolbar-label']}>{t.layoutLabel}</span>
            {LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={layout === option.value}
                onClick={() => handleLayoutChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

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
          {pageSelectorError && (
            <p id="page-selector-error" class={pdfToolStyles['page-selector-error']} role="alert">
              {pageSelectorError}
            </p>
          )}

          <button
            type="button"
            class={`${pdfToolStyles['tool-primary-action']}${status === 'converting' ? ` ${pdfToolStyles['is-processing']}` : ''}${status === 'done' ? ` ${pdfToolStyles['is-done']}` : ''}`}
            disabled={status === 'converting'}
            onClick={handleConvert}
          >
            {status === 'converting' ? (
              <ProgressRing progress={progress} label={t.converting} />
            ) : (
              formatMessage(t.convertTo, { format: formatLabel })
            )}
          </button>

          {status === 'error' && (
            <ErrorMessage>{t.convertFailed}</ErrorMessage>
          )}

          {status === 'done' && images.length > 0 && (
            <>
              {images.length === 1 ? (
                <a
                  ref={downloadRef}
                  class={pdfToolStyles['download-button']}
                  href={images[0].url}
                  download={images[0].filename}
                  onClick={() => recordAction('download')}
                >
                  <svg class={pdfToolStyles['download-check']} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" class={pdfToolStyles['check-circle']} />
                    <path d="M7.5 12.5l3 3 6-6.5" class={pdfToolStyles['check-mark']} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                  </svg>
                  {formatMessage(t.downloadOne, { format: formatLabel })}
                </a>
              ) : (
                <>
                  <button ref={downloadRef} type="button" class={pdfToolStyles['download-button']} onClick={downloadAll}>
                    {formatMessage(t.downloadMany, { count: images.length })}
                  </button>
                  <ul class={fileListStyles['file-list']}>
                    {images.map((image) => (
                      <li key={image.pageNumber} class={fileListStyles['file-item']}>
                        <span class={fileListStyles['file-name']}>{formatMessage(t.pageRow, { number: image.pageNumber })}</span>
                        <a href={image.url} download={image.filename} onClick={() => recordAction('download')}>
                          {t.downloadRow}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <PdfShareButton
                visible={shareReady}
                onShare={handleShare}
                label={images.length === 1 ? formatMessage(t.shareOne, { format: formatLabel }) : formatMessage(t.shareMany, { count: images.length })}
              />
            </>
          )}
        </div>
      )}
      <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
    </BasePdfTool>
  );
}
