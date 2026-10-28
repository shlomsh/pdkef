import { FileSignature, Merge } from 'lucide-preact';
import type { ExportHandoffItem } from '#shell/ExportHandoffs.tsx';
import type { HandoffTool } from '#shell/pageWorkspace/useDownloadFlow.ts';
import type { CompressMessages } from '../messages';

/** The tools a finished PDF can go on to (never Compress itself); a photo goes to none, it only shares. */
export function compressHandoffTools(kind: 'pdf' | 'image' | null): HandoffTool[] {
  return kind === 'pdf' ? ['sign', 'merge'] : [];
}

/** The phone strip's hand-off chips, in the same order as the rail's FinishRow. */
export function compressHandoffItems(kind: 'pdf' | 'image' | null, t: Pick<CompressMessages, 'handoffSign' | 'handoffMerge'>): ExportHandoffItem[] {
  return compressHandoffTools(kind).map((tool) => (
    tool === 'sign'
      ? { tool, label: t.handoffSign, Icon: FileSignature }
      : { tool, label: t.handoffMerge, Icon: Merge }
  ));
}
