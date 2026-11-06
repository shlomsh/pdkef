import type { ScanVerdict } from './scanCheck.ts';

export type CrookedVerdict = Exclude<ScanVerdict, 'straight'>;

/** @testSeam */
export const SCAN_OFFER_KEY = 'pdkef:highlight:scan-offered';
/** How many files are remembered as already offered; the oldest fall off. */
const MAX_REMEMBERED = 200;

export const isCrooked = (verdict: ScanVerdict | null): verdict is CrookedVerdict =>
  verdict !== null && verdict !== 'straight';

function readIds(storage: Pick<Storage, 'getItem'>): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SCAN_OFFER_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // expected: unreadable JSON or a refused read counts as nothing offered yet
    return [];
  }
}

/**
 * True the first time for a file, false after. Storage that throws answers true: a repeated quiet
 * line costs less than never offering.
 */
export function claimScanOffer(sourceId: string, storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  const ids = readIds(storage);
  if (ids.includes(sourceId)) return false;
  try {
    storage.setItem(SCAN_OFFER_KEY, JSON.stringify([...ids, sourceId].slice(-MAX_REMEMBERED)));
  } catch {
    // expected: storage refused the write, so the offer still shows
  }
  return true;
}
