import type { PlanEntry } from '#lib/pages/pagePlan.ts';
import { includedPageNumbers, rotationsOf } from '#lib/pages/pagePlan.ts';
import type { Built } from '#lib/output/usePreparedOutput.ts';
import { splitPdf } from './split.js';

export type SplitMode = 'combined' | 'separate';

/** What the prepared output holds for a plan: one blob (combined) or a part per page (separate). */
export async function buildSplit(
  file: File,
  plan: PlanEntry[],
  mode: SplitMode,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Built> {
  const pageNumbers = includedPageNumbers(plan);
  const outputs = await splitPdf(file, { pageNumbers, mode, rotations: rotationsOf(plan), onProgress, signal });
  if (mode === 'combined') return { blob: outputs[0].blob, pageCount: pageNumbers.length };
  return { parts: outputs.map((o: { blob: Blob; filename: string }) => ({ blob: o.blob, filename: o.filename })), pageCount: pageNumbers.length };
}
