import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';

/** What the corners hint says, in the order the states can overlap. One sentence at a time: in Fine-tune edges it is about the dots, otherwise about the corners. */
export function cornersHint(selected: ScanPage, failed: boolean, finding: number | null, findMissed: number[]): string {
  if (failed) return t.pageFailed;
  if (!selected.guessed || selected.preview === null || finding === selected.id) return t.findingEdges;
  if (findMissed.includes(selected.id)) return t.findMissed;
  if (selected.found === false && !selected.edited) return t.notFoundCorners;
  return selected.fine ? t.cornersTracedHint : t.cornersHint;
}
