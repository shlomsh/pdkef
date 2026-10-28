import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { defaultOutputName, moveEntry, orderKey, reorderEntries, sortEntries } from '../../lib/pages/pageOrder.js';
import { imagesToPdf } from '../../lib/images/imagesToPdf.js';
import { reportError } from '../../lib/telemetry/errorReport.ts';
import { usePreparedOutput } from '../../lib/output/usePreparedOutput.ts';
import { useDownloadFlow } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { PHOTO_ACCEPT, PHOTO_ACCEPTED_TYPES, usePhotoTileList } from '../../lib/hooks/usePhotoTileList.ts';
import { useRevokeOnUnmount } from '../../lib/output/useObjectUrls.js';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/telemetry/IslandErrorBoundary.tsx';
import ToolShell, { FileActions } from '../../shell/ToolShell.tsx';
import SortMenu from '../../shell/SortMenu.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import styles from './PdfImageToPdfTool.module.css';
import ImageToPdfVerb from './verb/ImageToPdfVerb.tsx';
import DownloadSheet from './components/DownloadSheet.tsx';
import ResultGrid from './components/ResultGrid.tsx';
import { toHandoffFiles } from './lib/handoffFiles';
import { useHoldUpdate } from '../../lib/hooks/useHoldUpdate.ts';
import { formatFileSize } from '../../lib/text/format.js';
import { useHandoffFilesIntake } from '../../lib/handoff/useHandoffIntake.ts';
import { useNavigatingAway } from '../../lib/hooks/useNavigatingAway.ts';
import { recordAction } from '../../lib/telemetry/actionTrail.ts';
import type { QuietPolicy } from '../../lib/output/quietPrepare.ts';
import { sendHandoff } from '../../lib/handoff/sendHandoff.ts';
import { englishImageToPdfMessages, type ImageToPdfMessages } from './messages';
import { type ShellMessages } from '../../shell/shellMessages';
import { formatMessage } from '../../lib/text/formatMessage';

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

export interface PdfImageToPdfToolProps {
  quietPolicy?: QuietPolicy;
  /** Server-rendered by its src/pages/[locale]/<tool>.astro route for a localized
   * edition; every key not overridden keeps the English default. */
  messages?: Partial<ImageToPdfMessages>;
  shellMessages?: Partial<ShellMessages>;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

export default withIslandBoundary(function PdfImageToPdfTool({ quietPolicy, messages: messagesProp, shellMessages, navigate = (href) => { window.location.href = href; } }: PdfImageToPdfToolProps = {}) {
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
    blocked: failed ? 'error' : null,
    // A Download tap on a ready link announces the ready message each time; the live region says it once.
    announce: (text: string) => {
      if (text === t.announceReady) setAnnouncement((previous) => (previous.trim() === text ? previous : text));
      else announce(text);
    },
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
      const files = await toHandoffFiles(entriesRef.current.map(({ file }) => file));
      await sendHandoff('scan-to-pdf', { files }, { navigate });
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
    <DownloadSheet
      t={t}
      failed={failed}
      fresh={fresh}
      downloadUrl={downloadUrl}
      fileName={fileName}
      detail={lastSizeRef.current}
      progress={prepared.progress}
      busy={tappedBusy}
      shareVisible={shareReady || (shareSeenRef.current && prepared.status === 'pending')}
      scanBusy={scanBusy}
      scanFailed={scanFailed}
      onPrepare={prepared.prepareNow}
      onDownloadClick={onDownloadClick}
      onShare={handleShare}
      onScan={openAsScan}
    />
  );

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={addFiles}
      intake={{ accept: PHOTO_ACCEPT, needsPdfjs: false }}
      identity={{
        label: fileSummary,
        meta: formatFileSize(entries.reduce((total, entry) => total + entry.file.size, 0)),
        hidden: true,
      }}
      empty={{ art: <ImageToPdfVerb />, message: t.dropHere }}
      clearAll={{ onClear: reset, summary: fileSummary }}
      analytics={{ tool: 'image-to-pdf', status }}
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

          <ResultGrid
            t={t}
            entries={entries}
            outputName={outputName}
            listRef={listRef}
            onRename={(next) => setCustomName(next.length > 0 && next !== defaultOutputName(entries) ? next : null)}
            onTileKeyDown={onTileKeyDown}
            onRemove={removeEntry}
          />

          {sheet}
        </div>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
});
