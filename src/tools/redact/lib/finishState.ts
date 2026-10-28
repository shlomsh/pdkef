import { formatFileSize } from '../../../lib/text/format.js';
import { formatMessage } from '../../../lib/text/formatMessage.ts';
import { englishRedactMessages } from '../messages.ts';
import type { RedactMessages } from '../messages.ts';

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
  /** Bytes of the saved file; null until saved. */
  fileSize: number | null;
}


export function finishStatusText(f: FinishFacts, messages: RedactMessages = englishRedactMessages): string | null {
  const m = messages.finish;
  switch (f.phase) {
    case 'exporting': {
      const pct = Math.round(Math.min(1, Math.max(0, f.progress)) * 100);
      return formatMessage(m.saving, { name: f.fileName, pct });
    }
    case 'saved': {
      const base = formatMessage(m.saved, { name: f.fileName, pages: f.pageCount === 1 ? m.pageOne : formatMessage(m.pageMany, { count: f.pageCount }) });
      return typeof f.fileSize === 'number' ? `${base} · ${formatFileSize(f.fileSize)}` : base;
    }
    case 'cancelled':
      return m.cancelled;
    default:
      return null;
  }
}

export function finishCountText(f: FinishFacts, messages: RedactMessages = englishRedactMessages): string | null {
  const m = messages.finish;
  const parts: string[] = [];
  if (f.boxCount > 0) parts.push(f.boxCount === 1 ? m.boxOne : formatMessage(m.boxMany, { count: f.boxCount }));
  if (f.deletionCount > 0) parts.push(f.deletionCount === 1 ? m.deletionOne : formatMessage(m.deletionMany, { count: f.deletionCount }));
  if (parts.length === 0) return null;
  return formatMessage(m.savesWith, { parts: parts.length === 2 ? formatMessage(m.and, { head: parts[0], last: parts[1] }) : parts[0] });
}

export function finishPagesText(f: FinishFacts, messages: RedactMessages = englishRedactMessages): string | null {
  const m = messages.finish;
  if (f.phase !== 'saved') return null;
  if (f.picturePages <= 0) return m.everyPageText;
  if (f.picturePages >= f.pageCount) return m.everyPagePicture;
  const n = f.picturePages;
  return formatMessage(n === 1 ? m.somePicturesOne : m.somePicturesMany, { count: n, total: f.pageCount });
}
