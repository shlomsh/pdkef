import { useCallback, type Dispatch, type MutableRef, type StateUpdater } from 'preact/hooks';
import { throwIfAborted } from '#lib/output/abort.js';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { beaconMaintenanceTransport, reportMaintenanceEvent, scanCameraPhoto } from '#lib/telemetry/maintenanceTelemetry.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { useHandoffFilesIntake } from '#lib/handoff/useHandoffIntake.ts';
import { PDF_TYPE, SCAN_ACCEPTED_TYPES } from '../lib/scanAccept.ts';
import { loadPipeline } from '../lib/loadPipeline.ts';
import { isCurrentKey, newPage, pageQuad, partitionFiles, replacePage, resultKey, withInspection } from '../lib/scanPages.ts';
import type { ProcessedPage } from '../lib/scanPipeline.ts';
import type { ScanDraftRestore } from '../lib/scanDraft.ts';
import { useScanDraft } from './useScanDraft.ts';
import type { PageResult, ScanPage, ScanWork } from '../state/scanWork.ts';
import { dropPageWork } from '../state/scanActions.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanDispatch, SetPages } from './scanHost.ts';
import { useScanPdfPages } from './useScanPdfPages.ts';
import { useScanResults } from './useScanResults.ts';

interface ScanPagesInput {
  pages: ScanPage[];
  setPages: SetPages;
  work: ScanWork;
  unmountedRef: MutableRef<boolean>;
  dispatch: ScanDispatch;
  announce: (text: string) => void;
  setRejectedFiles: (names: string[]) => void;
  results: Record<number, PageResult>;
  setResults: Dispatch<StateUpdater<Record<number, PageResult>>>;
  turnedPreviews: Record<string, string>;
  forgetTurned: (match: (key: string) => boolean) => void;
  /** The whole PDF's choices (useScanSettings): a remembered scan keeps them, and brings them back. */
  settings: Parameters<typeof useScanDraft>[0]['settings'];
}

type InspectHost = Pick<ScanPagesInput, 'work' | 'unmountedRef' | 'dispatch' | 'setPages'>;

/** One new photo through the queue: its preview and edge guess, or the mark that it could not be read. */
function inspectPage(page: ScanPage, { work, unmountedRef, dispatch, setPages }: InspectHost, { fromCamera = false, restored = false } = {}) {
  work.enqueue(async () => (work.removed.has(page.id) ? null : (await loadPipeline()).inspectPhoto(page.file)))
    .then((seen) => seen, (err) => {
      reportError('pdf_tool_run', err, 'scan_inspect_photo');
      return null;
    })
    .then((seen) => {
      if (seen && fromCamera) reportMaintenanceEvent(scanCameraPhoto(seen.width, seen.height), beaconMaintenanceTransport);
      if (work.removed.has(page.id) || unmountedRef.current) return;
      // A photo that could not be decoded: say so (failedIds), never "finding edges" forever.
      if (!seen) dispatch({ type: 'pageFailed', id: page.id });
      if (seen) work.previewBlobs.set(page.id, seen.preview);
      const preview = seen ? URL.createObjectURL(seen.preview) : null;
      setPages((current) => withInspection(current, page.id, seen, preview, !restored));
    });
}

/** The pages: photos coming in (a pick, a drop, a hand-off from Image to PDF), their one-at-a-time
 * processing, and the results and object URLs that follow them. */
export function useScanPages(input: ScanPagesInput) {
  const { work, setPages, dispatch, announce, setRejectedFiles } = input;
  const { enqueue } = work;

  /** The processed page for these corners and this look: cached, so the grid and the build share one run. */
  const processed = useCallback((page: ScanPage): Promise<ProcessedPage> => {
    const key = resultKey(page);
    const cached = work.processing.get(key);
    if (cached) return cached;
    const run = enqueue(async () => {
      // A corner moved again, the look changed or the page went while this waited: skip the decode and warp.
      throwIfAborted({ aborted: !isCurrentKey(work.pages, key) });
      return (await loadPipeline()).processPage(page.file, pageQuad(page), page.filter, !page.sheet);
    });
    work.processing.set(key, run);
    run.then(() => {
      if (!isCurrentKey(work.pages, key)) work.processing.delete(key);
    }, () => {
      // expected: a failed run is reported by its caller; dropping it here lets the next try run again
      work.processing.delete(key);
    });
    return run;
  }, []);

  const addPdfs = useScanPdfPages({ ...input, skipped: setRejectedFiles, inspect: (page) => inspectPage(page, input) });

  const addFiles = useCallback((fileList: FileList | File[], from?: { fromCamera: boolean }) => {
    const { accepted: all, rejectedNames } = partitionFiles(Array.from(fileList), SCAN_ACCEPTED_TYPES);
    setRejectedFiles(rejectedNames);
    const accepted = all.filter((f) => f.type !== PDF_TYPE);
    const pdfs = all.filter((f) => f.type === PDF_TYPE);
    if (pdfs.length > 0) addPdfs(pdfs);
    if (accepted.length === 0) return;
    const added = accepted.map((file) => newPage(file, work.defaultFilter));
    setPages((current) => [...current, ...added]);
    // New photos land on the table, the first one selected and brought into view.
    dispatch({ type: 'photosAdded', firstId: added[0].id });
    announce(added.length === 1 ? t.announceAddedOne : formatMessage(t.announceAddedMany, { count: added.length }));
    recordAction('add_files');
    for (const page of added) inspectPage(page, input, { fromCamera: from?.fromCamera });
  }, []);

  /** A retake: the new photo takes the old page's place, with the old page's look and its own id. */
  const retakeFile = useCallback((id: number, file: File) => {
    const old = work.pages.find((p) => p.id === id);
    if (!old) return;
    const fresh = newPage(file, old.filter);
    dropPageWork(input, old);
    setPages((current) => replacePage(current, id, fresh));
    dispatch({ type: 'pageRetaken', oldId: id, newId: fresh.id });
    inspectPage(fresh, input);
  }, []);

  /** A remembered scan (SCAN-18): its photos as pages again, with the looks, turns and corners they had.
   * Each photo is inspected again for its preview; the guess never overrides corners the person set. */
  const restorePages = useCallback(({ files, pages: stored }: ScanDraftRestore): ScanPage[] => {
    const restored = files.map((file, index) => {
      const { filter, turns, quad, sheet, opened } = stored[index];
      const page = newPage(file, filter);
      return { ...page, turns, sheet, opened, ...(quad ? { quad, edited: true } : {}) };
    });
    setPages(restored);
    dispatch({ type: 'photosAdded', firstId: restored[0].id });
    for (const page of restored) inspectPage(page, input, { restored: true });
    return restored;
  }, []);

  // Photos handed over from Image to PDF ("Clean it up as a scan") arrive like a pick.
  useHandoffFilesIntake('scan-to-pdf', (files) => addFiles(files));

  useScanResults({ ...input, processed });
  // SCAN-18: the scan is kept on the device as it changes, and comes back on the next visit or from Recents.
  const draft = useScanDraft({ pages: input.pages, results: input.results, settings: input.settings, restorePages, work });
  return { processed, addFiles, retakeFile, draft };
}
