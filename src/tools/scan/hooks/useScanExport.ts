import type { MutableRef } from 'preact/hooks';
import { throwIfAborted } from '../../../lib/abort.js';
import { reportError } from '../../../lib/errorReport.ts';
import type { QuietPolicy } from '../../../lib/quietPrepare.ts';
import { usePreparedOutput } from '../../../lib/usePreparedOutput.ts';
import { useDownloadFlow } from '../../../shell/pageWorkspace/useDownloadFlow.ts';
import { loadPipeline } from '../lib/loadPipeline.ts';
import { exportKeyFor } from '../lib/scanPages.ts';
import { SIZE_LIMITS, type SizeLimitId } from '../lib/scanBudget.ts';
import type { BuiltPage, PageSize, ProcessedPage } from '../lib/scanPipeline.ts';
import type { ScanPage, ScanWork } from '../state/scanWork.ts';
import { englishScanMessages as t } from '../messages.ts';

interface ScanExportInput {
  pages: ScanPage[];
  failedIds: number[];
  pageSize: PageSize;
  limit: SizeLimitId;
  customName: string | null;
  work: ScanWork;
  processed: (page: ScanPage) => Promise<ProcessedPage>;
  unmountedRef: MutableRef<boolean>;
  bumpBuilt: () => void;
  setAnnouncement: (text: string) => void;
  quietPolicy: QuietPolicy | undefined;
  navigate: ((href: string) => void) | undefined;
}

/** One build of the PDF from the latest render's inputs (work.inputs), pages made one at a time. */
async function buildScan(input: ScanExportInput, signal: AbortSignal, onProgress: (fraction: number) => void) {
  const { work, processed, unmountedRef, bumpBuilt } = input;
  const { pages: current, pageSize: size, limit: chosen, key: builtKey } = work.inputs;
  const made = await Promise.all(current.map((page) => processed(page)));
  throwIfAborted(signal);
  const budgetBytes = SIZE_LIMITS.find((l) => l.id === chosen)?.bytes ?? null;
  // Through the queue like every decode: a phone holds one photo's worth of pixels at a time.
  const fit = await work.enqueue(async () => (await loadPipeline()).buildScanPdf(made, { pageSize: size, budgetBytes, onProgress, signal }));
  throwIfAborted(unmountedRef.current ? AbortSignal.abort() : signal);
  const builtAs = builtKey as string;
  if (fit.metTarget) work.missedKeys.delete(builtAs);
  else work.missedKeys.add(builtAs);
  work.keepShown({ key: builtAs, pages: fit.pages.map((page: BuiltPage) => ({ url: URL.createObjectURL(page.blob), place: page.place })) });
  bumpBuilt();
  return { blob: fit.blob, pageCount: current.length };
}

/** The PDF prepared for the current pages and settings, and the download flow over it. */
export function useScanExport(input: ScanExportInput) {
  const { pages, failedIds, pageSize, limit, customName, work, setAnnouncement, quietPolicy, navigate } = input;
  const key = exportKeyFor(pages, failedIds, pageSize, limit);
  work.inputs = { pages, pageSize, limit, key };
  const prepared = usePreparedOutput({
    key,
    quietPolicy,
    build: (signal, onProgress) => buildScan(input, signal, onProgress),
    onBuildError: (err) => reportError('pdf_tool_run', err, 'prepare_scan'),
  });

  const outputName = customName ?? t.defaultName;
  const fileName = `${outputName}.pdf`;
  const downloadFlow = useDownloadFlow({
    prepared,
    fileName,
    // A photo that could not be read holds the PDF back: Download says so instead of preparing for good.
    blocked: prepared.status === 'error' || failedIds.length > 0 ? 'error' : null,
    announce: setAnnouncement,
    messages: { ready: t.readyAnnouncement, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
    navigate,
  });
  work.resetDownloadFlow = downloadFlow.reset;
  return { key, prepared, outputName, fileName, downloadFlow };
}
