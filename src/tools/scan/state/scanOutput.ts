import type { PreparedOutput } from '#lib/output/usePreparedOutput.ts';
import type { useDownloadFlow } from '#shell/pageWorkspace/useDownloadFlow.ts';
import type { SizeLimitId } from '../lib/scanBudget.ts';
import type { PageSize } from '../lib/scanPipeline.ts';

type Flow = ReturnType<typeof useDownloadFlow>;

/** What the download row, the table and the errors read about the PDF being made. */
export interface ScanOutput {
  prepared: PreparedOutput;
  flow: Flow;
  fileName: string;
  /** The size-and-pages line under the Download button. */
  detail: string;
  outputName: string;
  isRenaming: boolean;
  onRename: (name: string) => void;
  onEditingChange: (editing: boolean) => void;
  onShowFailedPage: () => void;
  /** The quiet line saying the scan is kept on the device (SCAN-18), or null when there is nothing to say. */
  draftStatus: { label: string; failed: boolean } | null;
}

/** The paper and the size limit the person chose. */
export interface ScanOptionsProps {
  pageSize: PageSize;
  limit: SizeLimitId;
  onPageSize: (next: PageSize) => void;
  onLimit: (next: SizeLimitId) => void;
  limitNote: string | undefined;
}
