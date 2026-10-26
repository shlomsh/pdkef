import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ScanLine } from 'lucide-preact';
import { defaultOutputName, moveEntry, orderKey, reorderEntries, sortEntries } from '../../lib/pageOrder.js';
import { imagesToPdf } from '../../lib/imagesToPdf.js';
import { reportError } from '../../lib/errorReport.ts';
import { usePreparedOutput } from '../../lib/usePreparedOutput.ts';
import { useDownloadFlow } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { PHOTO_ACCEPT, PHOTO_ACCEPTED_TYPES, usePhotoTileList } from '../../lib/usePhotoTileList.ts';
import { useRevokeOnUnmount } from '../../lib/useObjectUrls.js';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import ToolShell, { FileActions, useToolShell } from '../../shell/ToolShell.tsx';
import SortMenu from '../../shell/SortMenu.tsx';
import OutputName from '../../shell/OutputName.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import styles from './PdfImageToPdfTool.module.css';
import ImageToPdfVerb from './verb/ImageToPdfVerb.tsx';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ProgressRing from '../../shell/ProgressRing.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import DownloadButton from '../../shell/DownloadButton.tsx';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { formatFileSize } from '../../lib/format.js';
import { useHandoffFilesIntake } from '../../lib/useHandoffIntake.ts';
import { useNavigatingAway } from '../../lib/useNavigatingAway.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import type { QuietPolicy } from '../../lib/quietPrepare.ts';
import { englishImageToPdfMessages, type ImageToPdfMessages } from '../../i18n/toolMessages';
import { type ShellMessages } from '../../shell/shellMessages';
import { formatMessage } from '../../lib/formatMessage';

export interface ImageEntry {
  id: number;
  file: File;
  thumbnail: string;
}

let nextId = 0;

const sortOptions = (t: ImageToPdfMessages) => [
  { value: 'custom', label: t.sortCustom },
  { value: 'nameAsc', label: t.sortNameAsc },
  { value: 'nameDesc', label: t.sortNameDesc },
  { value: 'dateAsc', label: t.sortDateAsc },
  { value: 'dateDesc', label: t.sortDateDesc },
];

const imageCount = (t: ImageToPdfMessages, count: number) =>
  formatMessage(count === 1 ? t.imageCountOne : t.imageCountOther, { count });

function toEntry(file: File): ImageEntry {
  return { id: nextId++, file, thumbnail: URL.createObjectURL(file) };
}

// Its own component so it can reach the shell context (BasePdfTool provides it to its children).
function AddImagesTile({ label }: { label: string }) {
  const { requestReplace } = useToolShell();
  return (
    <li class={styles['add-tile']}>
      <button type="button" class={styles['add-button']} onClick={requestReplace}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        {label}
      </button>
    </li>
  );
}

export interface PdfImageToPdfToolProps {
  quietPolicy?: QuietPolicy;
  /** Server-rendered by its src/pages/[locale]/<tool>.astro route for a localized
   * edition; every key not overridden keeps the English default. */
  messages?: Partial<ImageToPdfMessages>;
  shellMessages?: Partial<ShellMessages>;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

export default function PdfImageToPdfTool({ quietPolicy, messages: messagesProp, shellMessages, navigate = (href) => { window.location.href = href; } }: PdfImageToPdfToolProps = {}) {
  const t: ImageToPdfMessages = { ...englishImageToPdfMessages, ...messagesProp };
  const [scanBusy, setScanBusy] = useNavigatingAway();
  const [scanFailed, setScanFailed] = useState(false);
  const [entries, setEntries] = useState<ImageEntry[]>([]);
  const [sortMode, setSortMode] = useState('custom');
  const [customName, setCustomName] = useState<string | null>(null);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  // Repeats of the same sentence must still be announced: alternate a trailing no-break space.
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => (previous === text ? `${text}\u00A0` : text));
  }, []);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const lastSizeRef = useRef<string | undefined>(undefined);
  const shareSeenRef = useRef(false);
  const startedRef = useRef(false);
  const exportPendingRef = useRef(false);

  // The PDF for the current page order, built in the background once the person has gone quiet.
  const key = orderKey(entries);
  const prepared = usePreparedOutput({
    key: key === '' ? null : key,
    quietPolicy,
    build: async (signal, onProgress) => {
      const files = entriesRef.current.map((entry) => entry.file);
      return { blob: await imagesToPdf(files, onProgress, signal), pageCount: files.length };
    },
    onBuildError: (err) => reportError('pdf_tool_run', err, 'build_pdf_from_images'),
  });
  const fresh = prepared.status === 'ready';
  const failed = prepared.status === 'error';
  const downloadUrl = prepared.url;
  useHoldUpdate(prepared.status === 'pending');
  useHoldUpdate(entries.length > 0, 'open');
  // The first build after the first pick starts at once; later changes wait for quiet.
  useEffect(() => {
    if (key === '') startedRef.current = false;
    else if (!startedRef.current) {
      startedRef.current = true;
      prepared.prepareNow();
    }
  }, [key]);

  const outputName = customName ?? defaultOutputName(entries);
  const fileName = `${outputName}.pdf`;

  const downloadFlow = useDownloadFlow({
    prepared,
    fileName,
    hrefs: {},
    blocked: failed ? 'error' : null,
    announce,
    messages: { ready: t.announceReady, shared: t.announceShared, canceled: t.announceShareCanceled, shareError: t.announceShareError },
    // A tap that beat the build is delivered by the flow; the tap on a ready link records its own download.
    onDelivered: () => {
      if (!exportPendingRef.current) return;
      exportPendingRef.current = false;
      recordAction('download');
    },
  });
  const { shareReady, handleShare: shareOutput, onDownloadTap, onRowPreparingTap, reset: resetDownloadFlow } = downloadFlow;
  // Analytics follow the person's Download tap only (Merge's rule, ANALYTICS.md): background builds report nothing.
  const tapped = downloadFlow.tap === 'processing';
  const status = failed && tapped ? 'error' : tapped ? 'converting' : downloadFlow.tap;
  if (fresh && prepared.blob) lastSizeRef.current = formatFileSize(prepared.blob.size);
  if (entries.length === 0) lastSizeRef.current = undefined;
  if (shareReady) shareSeenRef.current = true;
  if (entries.length === 0) shareSeenRef.current = false;

  // Revoke every live thumbnail object URL on unmount.
  useRevokeOnUnmount(entries.map((e) => e.thumbnail));

  const reordered = useCallback((next: ImageEntry[]) => {
    setEntries(next);
    setSortMode('custom');
    recordAction('reorder');
  }, []);

  const { listRef, focusIdRef } = usePhotoTileList({
    active: entries.length > 0,
    items: entries,
    ghostClass: styles['is-ghost'],
    chosenClass: styles['is-chosen'],
    onReorder: (oldIndex, newIndex) => {
      setEntries((current) => reorderEntries(current, oldIndex, newIndex));
      setSortMode('custom');
      recordAction('reorder');
    },
  });

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const imageFiles = incoming.filter((f) => PHOTO_ACCEPTED_TYPES.includes(f.type));
    const rejected = incoming.filter((f) => !PHOTO_ACCEPTED_TYPES.includes(f.type));

    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);
    if (imageFiles.length === 0) return;

    const newEntries = imageFiles.map(toEntry);
    setEntries((current) => [...current, ...newEntries]);
    setSortMode('custom');
    announce(formatMessage(newEntries.length === 1 ? t.announceAddedOne : t.announceAddedMany, { count: newEntries.length }));
    recordAction('add_files');
  }, []);

  // SITE-42: files picked on the home page arrive as a hand-off, collected on
  // mount and sent down the same path a manual pick takes. This tool restores
  // nothing on mount, so there is no restore to race - see useHandoffIntake.ts.
  useHandoffFilesIntake('image-to-pdf', (files) => addFiles(files));

  const resetTap = useCallback(() => {
    resetDownloadFlow();
    exportPendingRef.current = false;
  }, [resetDownloadFlow]);

  const removeEntry = useCallback((id: number) => {
    const current = entriesRef.current;
    const index = current.findIndex((e) => e.id === id);
    const removed = current[index];
    if (removed) {
      announce(formatMessage(t.announceRemoved, { name: removed.file.name }));
      URL.revokeObjectURL(removed.thumbnail);
    }
    const left = current.filter((e) => e.id !== id);
    const nextFocus = left[index] ?? left[index - 1];
    // Emptying the list returns to the empty state, which has no tile to focus.
    focusIdRef.current = nextFocus ? nextFocus.id : null;
    setEntries(left);
    if (left.length === 0) {
      resetTap();
      setCustomName(null);
      setSortMode('custom');
    }
    recordAction('remove_file');
  }, []);

  const reset = useCallback(() => {
    setEntries((current) => {
      for (const entry of current) URL.revokeObjectURL(entry.thumbnail);
      return [];
    });
    setSortMode('custom');
    setCustomName(null);
    resetTap();
    setRejectedFiles([]);
    announce(t.announceCleared);
    recordAction('clear_all');
  }, []);

  const onTileKeyDown = (event: KeyboardEvent, id: number) => {
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0 || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const next = moveEntry(entries, id, delta);
    if (next === entries) return;
    event.preventDefault();
    focusIdRef.current = id;
    announce(formatMessage(t.announceMoved, { name: entries.find((e: ImageEntry) => e.id === id)?.file.name ?? '', position: next.findIndex((e: ImageEntry) => e.id === id) + 1, total: next.length }));
    reordered(next);
  };

  const applySort = (value: string) => {
    if (value === 'custom') return;
    setEntries((current) => sortEntries(current, value));
    setSortMode(value);
    announce(t.announceReordered);
    recordAction('sort');
  };

  // A tap on Download before the build is done: show the preparing look and deliver when it lands.
  const onDownloadClick = (event: MouseEvent) => {
    if (fresh && downloadUrl) {
      // The browser delivers the link itself; the flow records the download.
      recordAction('export');
      onDownloadTap();
      return;
    }
    event.preventDefault();
    if (tapped) return;
    recordAction('export');
    exportPendingRef.current = true;
    announce(t.announcePreparing);
    onRowPreparingTap();
  };

  const handleShare = async () => {
    // Stale: a change is waiting for quiet, and the prepared PDF is the previous one.
    if (!fresh) {
      announce(t.announceUpdating);
      return;
    }
    await shareOutput();
  };

  // The photographed pages, in page order, parked for Scan to PDF (one multi-file hand-off).
  const openAsScan = async () => {
    if (scanBusy) return;
    setScanBusy(true);
    setScanFailed(false);
    try {
      const { saveHandoff } = await import('../../lib/drafts/draftStore.js');
      const files = await Promise.all(
        entriesRef.current.map(async ({ file }) => ({ fileName: file.name, fileType: file.type, fileBytes: await file.arrayBuffer() })),
      );
      if (!(await saveHandoff('scan-to-pdf', { files }))) throw new Error('handoff');
      navigate('/scan-to-pdf/');
    } catch {
      // expected: saveHandoff reports its own failure; this shows the status line
      setScanFailed(true);
      setScanBusy(false);
    }
  };

  const hasFiles = entries.length > 0;
  const fileSummary = imageCount(t, entries.length);
  const tappedBusy = tapped && !fresh && !failed;

  const sheet = (
    <div
      ref={sheetRef}
      class={styles.sheet}
      onPointerEnter={prepared.prepareNow}
      onFocusIn={prepared.prepareNow}
      onPointerDown={prepared.prepareNow}
    >
      {failed ? (
        <>
          <ErrorMessage>{t.buildFailed}</ErrorMessage>
          <button type="button" class={pdfToolStyles['tool-primary-action']} onClick={prepared.prepareNow}>
            {t.tryAgain}
          </button>
        </>
) : (
        <>
          {/* Silent until a tap: while a change waits for quiet the sheet keeps its shape, with the
              last size shown and Share still there (inert until the new PDF lands). */}
          <DownloadButton
            autoFocus={false}
            href={fresh && downloadUrl ? downloadUrl : '#'}
            download={fileName}
            label={t.downloadLabel}
            detail={lastSizeRef.current}
            onClick={onDownloadClick}
            busy={tappedBusy ? <ProgressRing progress={prepared.progress} label={t.preparing} /> : undefined}
          />
          <PdfShareButton visible={shareReady || (shareSeenRef.current && prepared.status === 'pending')} onShare={handleShare} label={t.shareLabel} />
        </>
      )}
      <button type="button" class={styles['scan-button']} disabled={scanBusy} onClick={openAsScan}>
        <ScanLine size={16} aria-hidden="true" />
        {t.scanHandoff}
      </button>
      {scanFailed && <p class={pdfToolStyles['hint-message']} role="status">{t.scanHandoffFailed}</p>}
    </div>
  );

  return (
    <BasePdfTool
      emptyArt={<ImageToPdfVerb />}
      hasFiles={hasFiles}
      analyticsTool="image-to-pdf"
      analyticsStatus={status}
      onFilesAdded={addFiles}
      accept={PHOTO_ACCEPT}
      emptyStateMessage={t.dropHere}
      fileLabel={fileSummary}
      fileMeta={formatFileSize(entries.reduce((total, entry) => total + entry.file.size, 0))}
      onClearAll={reset}
      clearSummary={fileSummary}
      hideIdentity
      shellMessages={shellMessages}
      needsPdfjs={false}
    >
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: rejectedFiles[0] })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {hasFiles && (
        <div class={styles['loaded-layout']}>
          <div class={styles.strip}>
            <ToolShell flush>
              <FileActions />
            </ToolShell>
          </div>

          <div class={styles.controls}>
            {entries.length > 1 && (
              <SortMenu label={t.sortLabel} ariaLabel={t.sortAriaLabel} value={sortMode} options={sortOptions(t)} onChange={applySort} />
            )}
          </div>

          <div class={styles.result}>
            <p class={styles.heading}>
              <OutputName name={outputName} label={t.fileNameLabel} onRename={(next) => setCustomName(next.length > 0 && next !== defaultOutputName(entries) ? next : null)} />
              <span class={styles['heading-meta']}>· {entries.length} {entries.length === 1 ? t.pageCountOne : t.pageCountOther}</span>
            </p>
            <p class="sr-only" id="reorder-hint">
              {t.reorderHint}
            </p>
            <ul class={styles.grid} ref={listRef} aria-describedby="reorder-hint">
              {entries.map((entry, index) => (
                <li key={entry.id} class={styles.tile} data-id={entry.id}>
                  <div
                    class={styles.page}
                    data-page
                    tabIndex={0}
                    role="button"
                    aria-label={formatMessage(t.tileLabel, { name: entry.file.name, position: index + 1, total: entries.length })}
                    onKeyDown={(e) => onTileKeyDown(e, entry.id)}
                  >
                    <img src={entry.thumbnail} alt="" draggable={false} />
                    <span class={styles.badge} aria-hidden="true">{index + 1}</span>
                  </div>
                  <button
                    type="button"
                    class={styles.remove}
                    aria-label={formatMessage(t.removeLabel, { name: entry.file.name })}
                    onClick={() => removeEntry(entry.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
              <AddImagesTile label={t.addImages} />
            </ul>
          </div>

          {sheet}
        </div>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
