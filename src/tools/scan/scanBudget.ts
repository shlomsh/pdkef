import { searchTargetSize, QUALITY_SEARCH_STEPS } from '../../lib/targetSizeSearch.js';

// The size limit for a whole scanned PDF: the same search Compress uses (quality first,
// then resolution), over every page at once. Pure: the caller injects how pages render
// at a scale and how a PDF is built from them at a quality.

/** Highest fidelity first. 0.3 of the 2400px output still leaves a 720px page. */
export const SCAN_SCALE_LADDER = [1, 0.8, 0.65, 0.5, 0.4, 0.3];
/** The JPEG quality with no limit set. */
export const SCAN_QUALITY = 0.82;
/** Text stays readable down to here; below it, the search drops resolution instead. */
const SCAN_MIN_QUALITY = 0.3;

export type SizeLimitId = 'none' | '2mb' | '1mb' | '500kb';
export const SIZE_LIMITS: { id: SizeLimitId; bytes: number | null }[] = [
  { id: 'none', bytes: null },
  { id: '2mb', bytes: 2 * 1024 * 1024 },
  { id: '1mb', bytes: 1024 * 1024 },
  { id: '500kb', bytes: 500 * 1024 },
];

export interface FitInput<H> {
  budgetBytes: number | null;
  render(scale: number): H | Promise<H>;
  build(handle: H, quality: number): Promise<Blob>;
  release?(handle: H): void;
  deadlineMs: number;
}

export interface FitResult { blob: Blob; metTarget: boolean; scale: number; quality: number }

export async function fitScanToBudget<H>({ budgetBytes, render, build, release, deadlineMs }: FitInput<H>): Promise<FitResult> {
  // Every rendered set the search has not released yet: a failed build must not strand them.
  const live = new Set<H>();
  const rendered = async (scale: number) => {
    const handle = await render(scale);
    live.add(handle);
    return handle;
  };
  const released = (handle: H) => {
    if (!live.delete(handle)) return;
    release?.(handle);
  };
  try {
    const full = await rendered(SCAN_SCALE_LADDER[0]);
    const first = await build(full, SCAN_QUALITY);
    // Under the limit already (or no limit): never degrade a scan for nothing.
    if (budgetBytes === null || first.size <= budgetBytes) {
      released(full);
      return { blob: first, metTarget: true, scale: SCAN_SCALE_LADDER[0], quality: SCAN_QUALITY };
    }

    const best = await searchTargetSize({
      scales: SCAN_SCALE_LADDER,
      renderAtScale: (scale: number, index: number) => (index === 0 ? full : rendered(scale)),
      encode: build,
      budgetBytes,
      minQuality: SCAN_MIN_QUALITY,
      maxQuality: SCAN_QUALITY,
      qualitySteps: QUALITY_SEARCH_STEPS,
      deadlineMs,
      releaseHandle: released,
    });
    released(best.handle);
    return { blob: best.encoded as Blob, metTarget: best.encoded.size <= budgetBytes, scale: best.scale, quality: best.quality };
  } catch (err) {
    for (const handle of [...live]) released(handle);
    throw err;
  }
}
