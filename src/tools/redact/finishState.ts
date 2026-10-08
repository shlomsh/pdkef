// All wording for Redact's finish area, as pure functions of a few facts.
export type FinishPhase = 'empty' | 'ready' | 'exporting' | 'saved' | 'cancelled';

export interface FinishFacts {
  phase: FinishPhase;
  /** 0..1 */
  progress: number;
  fileName: string;
  pageCount: number;
  picturePages: number;
  boxCount: number;
  deletionCount: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function finishStatusText(f: FinishFacts): string | null {
  switch (f.phase) {
    case 'exporting': {
      const pct = Math.round(Math.min(1, Math.max(0, f.progress)) * 100);
      return `Saving ${f.fileName}… ${pct}%`;
    }
    case 'saved':
      return `Saved ${f.fileName} · ${plural(f.pageCount, 'page', 'pages')}`;
    case 'cancelled':
      return 'You changed something, so that download stopped. Download again when ready.';
    default:
      return null;
  }
}

export function finishCountText(f: FinishFacts): string | null {
  const parts: string[] = [];
  if (f.boxCount > 0) parts.push(plural(f.boxCount, 'box', 'boxes'));
  if (f.deletionCount > 0) parts.push(plural(f.deletionCount, 'deletion', 'deletions'));
  return parts.length ? `Saves with ${parts.join(' and ')}` : null;
}

export function finishPagesText(f: FinishFacts): string | null {
  if (f.phase !== 'saved') return null;
  if (f.picturePages <= 0) return 'Every page keeps its text.';
  if (f.picturePages >= f.pageCount) return 'Every page is saved as a picture, so nothing hides under a box.';
  const n = f.picturePages;
  return `${n} of ${f.pageCount} pages ${n === 1 ? 'is' : 'are'} saved as ${n === 1 ? 'a picture' : 'pictures'}, so nothing hides under a box. The rest keep their text.`;
}
