import { useEffect, type Dispatch, type MutableRef, type StateUpdater } from 'preact/hooks';
import { isAbortError } from '../../../lib/abort.js';
import { reportError } from '../../../lib/errorReport.ts';
import { isCurrentKey, resultKey } from '../lib/scanPages.ts';
import type { ProcessedPage } from '../lib/scanPipeline.ts';
import type { PageResult, ScanPage, ScanWork } from '../state/scanWork.ts';
import type { ScanDispatch } from './scanHost.ts';

interface ScanResultsInput {
  pages: ScanPage[];
  work: ScanWork;
  processed: (page: ScanPage) => Promise<ProcessedPage>;
  unmountedRef: MutableRef<boolean>;
  dispatch: ScanDispatch;
  results: Record<number, PageResult>;
  setResults: Dispatch<StateUpdater<Record<number, PageResult>>>;
  turnedPreviews: Record<string, string>;
}

type ResultHost = Pick<ScanResultsInput, 'work' | 'processed' | 'unmountedRef' | 'dispatch' | 'setResults'>;

/** A finished run becomes the page's result, unless the page moved on while it ran. */
function adoptResult(page: ScanPage, key: string, result: ProcessedPage, { work, unmountedRef, dispatch, setResults }: ResultHost) {
  work.watching.delete(key);
  if (unmountedRef.current || !isCurrentKey(work.pages, key) || work.results[page.id]?.key === key) return;
  const previous = work.results[page.id];
  if (previous) {
    URL.revokeObjectURL(previous.url);
    URL.revokeObjectURL(previous.thumbUrl);
  }
  // Older corners for this page will not come back; let their bytes go.
  work.dropCached(page.id, key);
  work.results = { ...work.results, [page.id]: { key, url: URL.createObjectURL(result.blob), thumbUrl: URL.createObjectURL(result.thumb), page: result } };
  setResults(work.results);
  dispatch({ type: 'failureCleared', id: page.id });
}

function watchResult(page: ScanPage, host: ResultHost) {
  const { work, processed, dispatch } = host;
  // Not yet inspected, or inspected and unreadable (failedIds already says so): nothing to process.
  if (!page.guessed || page.preview === null) return;
  const key = resultKey(page);
  if (work.results[page.id]?.key === key || work.watching.has(key)) return;
  work.watching.add(key);
  processed(page).then((result) => adoptResult(page, key, result, host), (err) => {
    work.watching.delete(key);
    // expected: work superseded before its turn is skipped on purpose, not a failure
    if (isAbortError(err)) return;
    reportError('pdf_tool_run', err, 'scan_process_page');
    dispatch({ type: 'pageFailed', id: page.id });
  });
}

/** Every guessed page gets its result for the current corners and look, one at a time; every live
 * object URL is revoked when the island goes. */
export function useScanResults({ pages, work, processed, unmountedRef, dispatch, results, setResults, turnedPreviews }: ScanResultsInput) {
  useEffect(() => {
    for (const page of pages) watchResult(page, { work, processed, unmountedRef, dispatch, setResults });
  }, [pages]);

  work.urls = [
    ...pages.flatMap((p) => (p.preview ? [p.preview] : [])),
    ...Object.values(results).flatMap((r) => [r.url, r.thumbUrl]),
    ...Object.values(turnedPreviews),
    ...[...work.shown.values()].flatMap((kept) => kept.pages.map((p) => p.url)),
  ];
  useEffect(() => {
    // Set on mount too: a dev server's hot swap runs this cleanup on a live island, then mounts it again.
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      // A dev server's hot swap keeps the island's state, photos included: only a real unmount frees them.
      if (!import.meta.hot) work.urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
}
