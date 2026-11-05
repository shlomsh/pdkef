import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';

/** What the corners hint says, in the order the states can overlap. */
export function cornersHint(selected: ScanPage, failed: boolean, finding: number | null, findMissed: number[]): string {
  if (failed) return t.pageFailed;
  if (!selected.guessed || selected.preview === null || finding === selected.id) return t.findingEdges;
  if (findMissed.includes(selected.id)) return t.findMissed;
  if (selected.found === false && !selected.edited) return t.notFoundCorners;
  return t.cornersHint;
}
