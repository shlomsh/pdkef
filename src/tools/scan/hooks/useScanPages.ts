import { useCallback, type Dispatch, type MutableRef, type StateUpdater } from 'preact/hooks';
import { throwIfAborted } from '../../../lib/abort.js';
import { reportError } from '../../../lib/errorReport.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { formatMessage } from '../../../lib/formatMessage';
import { PHOTO_ACCEPTED_TYPES } from '../../../lib/usePhotoTileList.ts';
import { useHandoffFilesIntake } from '../../../lib/useHandoffIntake.ts';
import { loadPipeline } from '../lib/loadPipeline.ts';
import { isCurrentKey, newPage, pageQuad, partitionFiles, resultKey, withInspection } from '../lib/scanPages.ts';
import type { ProcessedPage } from '../lib/scanPipeline.ts';
import type { PageResult, ScanPage, ScanWork } from '../state/scanWork.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanDispatch, SetPages } from './scanHost.ts';
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
}

type InspectHost = Pick<ScanPagesInput, 'work' | 'unmountedRef' | 'dispatch' | 'setPages'>;

/** One new photo through the queue: its preview and edge guess, or the mark that it could not be read. */
function inspectPage(page: ScanPage, { work, unmountedRef, dispatch, setPages }: InspectHost) {
  work.enqueue(async () => (work.removed.has(page.id) ? null : (await loadPipeline()).inspectPhoto(page.file)))
    .then((seen) => seen, (err) => {
      reportError('pdf_tool_run', err, 'scan_inspect_photo');
      return null;
    })
    .then((seen) => {
      if (work.removed.has(page.id) || unmountedRef.current) return;
      // A photo that could not be decoded: say so (failedIds), never "finding edges" forever.
      if (!seen) dispatch({ type: 'pageFailed', id: page.id });
      if (seen) work.previewBlobs.set(page.id, seen.preview);
      const preview = seen ? URL.createObjectURL(seen.preview) : null;
      setPages((current) => withInspection(current, page.id, seen, preview));
    });
}

/** The pages: photos coming in (a pick, a drop, a hand-off from Image to PDF), their one-at-a-time
 * processing, and the results and object URLs that follow them. */
export function useScanPages(input: ScanPagesInput) {
  const { work, setPages, dispatch, announce, setRejectedFiles } = input;
  const { enqueue } = work;

  /** The processed page for these corners and this look: cached, so the strip and the build share one run. */
  const processed = useCallback((page: ScanPage): Promise<ProcessedPage> => {
    const key = resultKey(page);
    const cached = work.processing.get(key);
    if (cached) return cached;
    const run = enqueue(async () => {
      // A corner moved again, the look changed or the page went while this waited: skip the decode and warp.
      throwIfAborted({ aborted: !isCurrentKey(work.pages, key) });
      return (await loadPipeline()).processPage(page.file, pageQuad(page), page.filter);
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

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const { accepted, rejectedNames } = partitionFiles(Array.from(fileList), PHOTO_ACCEPTED_TYPES);
    setRejectedFiles(rejectedNames);
    if (accepted.length === 0) return;
    const added = accepted.map((file) => newPage(file, work.defaultFilter));
    setPages((current) => [...current, ...added]);
    // A new photo is shown first as itself, corners on top, to approve or adjust (Use these corners).
    // Also brings the new photo's corners into view, wherever the page was scrolled to pick it.
    dispatch({ type: 'photosAdded', firstId: added[0].id });
    announce(added.length === 1 ? t.announceAddedOne : formatMessage(t.announceAddedMany, { count: added.length }));
    recordAction('add_files');
    for (const page of added) inspectPage(page, input);
  }, []);

  // Photos handed over from Image to PDF ("Clean it up as a scan") arrive like a pick.
  useHandoffFilesIntake('scan-to-pdf', (files) => addFiles(files));

  useScanResults({ ...input, processed });
  return { processed, addFiles };
}
