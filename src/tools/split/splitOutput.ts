import type { PlanEntry } from '../../lib/pagePlan.ts';
import { includedPageNumbers } from '../../lib/pagePlan.ts';
import type { Built } from '../../lib/usePreparedOutput.ts';
import { splitPdf } from './split.js';

export type SplitMode = 'combined' | 'separate';

/** The rotation of each kept page that has one, by 1-based source page number: what splitPdf adds to the page's own. */
export function rotationsOf(plan: PlanEntry[]): Record<number, number> {
  const rotations: Record<number, number> = {};
  for (const entry of plan) if (!entry.skipped && entry.rotation) rotations[entry.pageIndex + 1] = entry.rotation;
  return rotations;
}

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
