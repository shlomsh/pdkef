import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { ScanLine } from 'lucide-preact';
import { defaultOutputName, moveEntry, reorderEntries, sortEntries } from '../../lib/pageOrder.js';
import { useImagesPdfBuild, type ImageEntry } from './useImagesPdfBuild.ts';
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
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { formatFileSize } from '../../lib/format.js';
import { useHandoffFilesIntake } from '../../lib/useHandoffIntake.ts';
import { useNavigatingAway } from '../../lib/useNavigatingAway.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import type { QuietPolicy } from '../../lib/quietPrepare.ts';
import {
  englishImageToPdfMessages,
  formatMessage,
  type ImageToPdfMessages,
  type ShellMessages,
} from '../../i18n/toolMessages';

let nextId = 0;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

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
  // Analytics follow the person's Download tap only (Merge's rule, ANALYTICS.md):
  // background builds report nothing.
  const [tap, setTap] = useState<'idle' | 'converting' | 'done'>('idle');
  const tapped = tap === 'converting';
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  const listRef = useRef<HTMLUListElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const focusIdRef = useRef<number | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const lastSizeRef = useRef<string | undefined>(undefined);
  const pendingTapRef = useRef(false);
  const exportedRef = useRef(false);

  const build = useImagesPdfBuild(entries, tapped, quietPolicy);
  const { fresh, blob, url: downloadUrl } = build;
  useHoldUpdate(build.building);
  useHoldUpdate(entries.length > 0, 'open');
  const status = build.failed && tapped ? 'error' : tap;

  const outputName = customName ?? defaultOutputName(entries);
  const fileName = `${outputName}.pdf`;

  useEffect(() => {
    if (fresh && blob) prepare(blob, fileName);
    // While a change waits for quiet the last PDF stays prepared, so the sheet keeps its shape;
    // Share is inert then (see handleShare).
    else if (entries.length === 0) clearPrepared();
  }, [fresh, blob, fileName, entries.length, prepare, clearPrepared]);
  if (fresh && blob) lastSizeRef.current = formatFileSize(blob.size);
  if (entries.length === 0) lastSizeRef.current = undefined;

  // Revoke every live thumbnail object URL on unmount.
  useRevokeOnUnmount(entries.map((e) => e.thumbnail));

  // A keyboard move re-parents the tile, which can drop focus: put it back.
  // A layout effect, so the focus is back before the next auto-repeated key lands.
  // Also where focus goes after a tile is removed.
  useLayoutEffect(() => {
    const id = focusIdRef.current;
    if (id === null) return;
    focusIdRef.current = null;
    const list = listRef.current;
    list?.querySelector<HTMLElement>(`[data-id="${id}"] [data-page]`)?.focus();
  }, [entries]);

  // Repeats of the same sentence must still be announced: alternate a trailing no-break space.
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => (previous === text ? `${text}\u00A0` : text));
  }, []);

  const reordered = useCallback((next: ImageEntry[]) => {
    setEntries(next);
    setSortMode('custom');
    recordAction('reorder');
  }, []);

  // Drag-to-reorder: SortableJS owns the DOM order during a drag; on drop we
  // read its final order back into state, which is the source of truth again.
  useEffect(() => {
    if (!listRef.current) return undefined;
    const sortable = Sortable.create(listRef.current, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      draggable: '[data-id]',
      filter: 'button',
      preventOnFilter: false,
      delay: 150,
      delayOnTouchOnly: true,
      ghostClass: styles['is-ghost'],
      chosenClass: styles['is-chosen'],
      forceFallback: false,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex === evt.newIndex || evt.oldIndex == null || evt.newIndex == null) return;
        const { oldIndex, newIndex } = evt;
        setEntries((current) => reorderEntries(current, oldIndex, newIndex));
        setSortMode('custom');
        recordAction('reorder');
      },
    });
    return () => sortable.destroy();
  }, [entries.length > 0]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const imageFiles = incoming.filter((f) => ACCEPTED_TYPES.includes(f.type));
    const rejected = incoming.filter((f) => !ACCEPTED_TYPES.includes(f.type));

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
    setTap('idle');
    pendingTapRef.current = false;
    exportedRef.current = false;
  }, []);

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
      if (!exportedRef.current) recordAction('export');
      exportedRef.current = false;
      recordAction('download');
      setTap('converting');
      return;
    }
    event.preventDefault();
    if (tapped) return;
    recordAction('export');
    exportedRef.current = true;
    pendingTapRef.current = true;
    setTap('converting');
    announce(t.announcePreparing);
    build.buildNow();
  };

  // A tap on a ready link: the browser delivers it, so the tap is done at once.
  useEffect(() => {
    if (tap === 'converting' && fresh && !pendingTapRef.current) setTap('done');
  }, [tap, fresh]);

  // The tap's delivery: the build is fresh and its link is on screen, so the download goes out.
  useEffect(() => {
    if (!fresh || !pendingTapRef.current || !downloadUrl) return;
    pendingTapRef.current = false;
    setTap('done');
    announce(t.announceReady);
    sheetRef.current?.querySelector<HTMLAnchorElement>('a[download]')?.click();
  }, [fresh, downloadUrl]);

  const handleShare = async () => {
    // Stale: a change is waiting for quiet, and the prepared PDF is the previous one.
    if (!fresh) {
      announce(t.announceUpdating);
      return;
    }
    const result = await sharePrepared();
    if (result.status === 'shared') recordAction('share');
    if (result.status === 'shared') announce(t.announceShared);
    else if (result.status === 'canceled') announce(t.announceShareCanceled);
    else if (result.status === 'error') announce(t.announceShareError);
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
  const tappedBusy = tapped && !fresh && !build.failed;

  const sheet = (
    <div
      ref={sheetRef}
      class={styles.sheet}
      onPointerEnter={build.buildNow}
      onFocusIn={build.buildNow}
      onPointerDown={build.buildNow}
    >
      {build.failed ? (
        <>
          <ErrorMessage>{t.buildFailed}</ErrorMessage>
          <button type="button" class={pdfToolStyles['tool-primary-action']} onClick={build.retry}>
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
            busy={tappedBusy ? <ProgressRing progress={build.progress} label={t.preparing} /> : undefined}
          />
          <PdfShareButton visible={shareReady} onShare={handleShare} label={t.shareLabel} />
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
      accept="image/jpeg,image/png"
      emptyStateMessage={t.dropHere}
      fileLabel={fileSummary}
      fileMeta={formatFileSize(entries.reduce((total, entry) => total + entry.file.size, 0))}
      onClearAll={reset}
      clearSummary={fileSummary}
      hideIdentity
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
