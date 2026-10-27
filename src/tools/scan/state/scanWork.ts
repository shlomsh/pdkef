import type { Quad } from '../lib/quad.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { FlattenFrom } from '../lib/flattenAnimation.ts';
import type { PageSize, Placement, ProcessedPage } from '../lib/scanPipeline.ts';
import type { SizeLimitId } from '../lib/scanBudget.ts';

export interface ScanPage {
  id: number;
  file: File;
  /** The small preview the corner editor and loupe show (scanPipeline's inspectPhoto); null until made. */
  preview: string | null;
  /** The photo's width over height, so its frame has a size before the preview decodes. */
  aspect: number | null;
  /** This page's look: a colour ID card and a printed form can sit in one PDF. */
  filter: ScanFilter;
  /** The person has seen this page's corners and used them (Use these corners). */
  reviewed: boolean;
  /** The page's corners in the photo, as photographed: rotating never moves them. */
  quad: Quad;
  /** Quarter turns clockwise for the page as it downloads (0 to 3): a page shot sideways stands up. */
  turns: number;
  /** The edge guess has run (or failed); until then the corners are the whole photo. */
  guessed: boolean;
  /** The person moved a corner: their corners win, the guess never overrides them. */
  edited: boolean;
  /** Whether the edge guess found a page: null until it has run. */
  found: boolean | null;
}

export interface PageResult { key: string; url: string; thumbUrl: string; page: ProcessedPage }
/** The pages of the last built PDF, in its order: what Download saves, page for page. */
export interface Shown { key: string; pages: { url: string; place: Placement }[] }

/** What the build reads when it runs: the latest render's inputs, not the ones it was created with. */
export interface BuildInputs { pages: ScanPage[]; pageSize: PageSize; limit: SizeLimitId; key: string | null }

/**
 * The island's true instance values: work queues, caches and the latest render's values, which async
 * callbacks read without a stale closure. None of it is lifecycle (that is scanState.ts) and none of it
 * draws anything by changing; the island holds one of these in a single ref.
 */
export class ScanWork {
  // Per built key, like the preparer's own cache: going back to a setting already built is a cache
  // hit with no build call, and its pages and its limit note must come back with it.
  shown = new Map<string, Shown>();
  missedKeys = new Set<string>();
  /** Each page's preview, kept as bytes too, so Find the page decodes 1600px instead of the photo. */
  previewBlobs = new Map<number, Blob>();
  /** One page is processed at a time, so a phone holds one full-size photo in memory, not ten. */
  queue: Promise<unknown> = Promise.resolve();
  processing = new Map<string, Promise<ProcessedPage>>();
  /** Keys whose result this component is already waiting on: one handler per run. */
  watching = new Set<string>();
  /** Pages removed while their edge guess still waited in the queue. */
  removed = new Set<number>();
  results: Record<number, PageResult> = {};
  hadPages = false;
  resetDownloadFlow: () => void = () => {};
  /** The photo and corners just approved, for the flatten animation into the result. */
  flattenFrom: FlattenFrom | null = null;
  stopFlatten: () => void = () => {};
  // The latest render's values, assigned on every render.
  pages: ScanPage[] = [];
  defaultFilter: ScanFilter = 'document';
  inputs: BuildInputs = { pages: [], pageSize: 'fit', limit: 'none', key: null };
  urls: string[] = [];

  enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    // The queue tail never rejects (below), so every task runs after the one before it.
    const run = this.queue.then(task);
    this.queue = run.catch(() => {
      // expected: the queue only orders work; each task's own caller handles its failure
    });
    return run;
  };

  dropCached = (id: number, keep?: string) => {
    for (const cachedKey of [...this.processing.keys()]) {
      if (cachedKey.startsWith(`${id}|`) && cachedKey !== keep) this.processing.delete(cachedKey);
    }
  };

  keepShown = (next: Shown) => {
    const map = this.shown;
    const old = map.get(next.key);
    if (old) old.pages.forEach((page) => URL.revokeObjectURL(page.url));
    map.delete(next.key);
    map.set(next.key, next);
    // Twice the preparer's cache (4), so a key it can still serve always has its pages here.
    while (map.size > 8) {
      const [oldest, evicted] = map.entries().next().value as [string, Shown];
      evicted.pages.forEach((page) => URL.revokeObjectURL(page.url));
      map.delete(oldest);
    }
  };

  forgetShown = () => {
    for (const kept of this.shown.values()) kept.pages.forEach((page) => URL.revokeObjectURL(page.url));
    this.shown.clear();
    this.missedKeys.clear();
  };
}
