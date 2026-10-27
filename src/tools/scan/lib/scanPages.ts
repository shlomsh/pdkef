import { FULL_QUAD, quadKey, rotateQuad, type Quad } from './quad.ts';
import type { ScanFilter } from './filters.ts';
import type { ScanPage } from '../state/scanWork.ts';

let nextId = 0;

/** What a page's result must carry to be current: the page, its corners, its look and its turns. */
export const resultKey = (page: ScanPage) => `${page.id}|${quadKey(page.quad)}|${page.filter}|${page.turns}`;
/** The corners the warp gets: the photo's own, one place on per quarter turn (quad.ts). */
export const pageQuad = (page: ScanPage) => rotateQuad(page.quad, page.turns);

/** True while `key` is what the page on screen and the current look ask for. */
export function isCurrentKey(pages: ScanPage[], key: string): boolean {
  const id = Number(key.slice(0, key.indexOf('|')));
  const live = pages.find((p) => p.id === id);
  return !!live && resultKey(live) === key;
}

/** The files of a pick that are photos, and the names of those that are not. */
export function partitionFiles(files: File[], acceptedTypes: readonly string[]) {
  return {
    accepted: files.filter((f) => acceptedTypes.includes(f.type)),
    rejectedNames: files.filter((f) => !acceptedTypes.includes(f.type)).map((f) => f.name),
  };
}

/** A new photo: the whole photo as its corners, the look last chosen, nothing inspected yet. */
export function newPage(file: File, filter: ScanFilter): ScanPage {
  return {
    id: nextId++, file, preview: null, aspect: null, filter, reviewed: false,
    quad: FULL_QUAD, turns: 0, guessed: false, edited: false, found: null,
  };
}

/** What inspecting a photo found: its guessed corners and size; null when it could not be decoded. */
interface Seen { quad: Quad | null; width: number; height: number }

/** The pages with page `id` marked as inspected. The person's own corners win over the guess. */
export function withInspection(pages: ScanPage[], id: number, seen: Seen | null, preview: string | null): ScanPage[] {
  const quad = seen?.quad ?? null;
  return pages.map((p) => (
    p.id !== id ? p : {
      ...p,
      guessed: true,
      found: !!quad,
      quad: p.edited || !quad ? p.quad : quad,
      preview,
      aspect: seen ? seen.width / seen.height : null,
    }
  ));
}

export const patchPage = (pages: ScanPage[], id: number, changes: Partial<ScanPage>): ScanPage[] => (
  pages.map((p) => (p.id === id ? { ...p, ...changes } : p))
);

/** One more quarter turn clockwise for page `id`. */
export const turnPage = (pages: ScanPage[], id: number): ScanPage[] => (
  pages.map((p) => (p.id === id ? { ...p, turns: (p.turns + 1) % 4 } : p))
);

/** -1 for the previous page, 1 for the next, 0 for any other key or one chosen with a modifier. */
export function tileDelta(event: { key: string; altKey: boolean; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): -1 | 0 | 1 {
  const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
    : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
  if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return 0;
  return delta;
}

/** The key a turned page's preview is stored under, or null for a page as photographed. */
export const turnKeyOf = (page: { id: number; turns: number } | undefined) => (
  page && page.turns !== 0 ? `${page.id}|${page.turns}` : null
);

/** The photo the corner editor shows: as photographed, or turned with the page (null while turning). */
export const shownPhoto = (page: ScanPage, turned: Record<string, string>) => (
  page.turns === 0 ? page.preview : turned[`${page.id}|${page.turns}`] ?? null
);

/** The shown page's width over height, quarter-turned when the page is on its side. */
export const shownAspect = (page: ScanPage | undefined) => (
  page && page.turns % 2 === 1 ? 1 / (page.aspect ?? 0.75) : page?.aspect ?? 0.75
);

/** The turned previews to keep and the URLs of those `match` lets go. */
export function partitionTurned(map: Record<string, string>, match: (key: string) => boolean) {
  const kept: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [k, url] of Object.entries(map)) {
    if (match(k)) dropped.push(url);
    else kept[k] = url;
  }
  return { kept, dropped };
}

/** "2, 4": where the failed pages sit in the list, counted from one. */
export const failedPositions = (pages: ScanPage[], failedIds: number[]) => (
  pages.filter((p) => failedIds.includes(p.id)).map((p) => pages.indexOf(p) + 1).join(', ')
);

/** Where a page was and which page the person lands on once it is gone. */
export function afterRemoval(pages: ScanPage[], id: number, view: 'corners' | 'result') {
  const index = pages.findIndex((p) => p.id === id);
  const left = pages.filter((p) => p.id !== id);
  return {
    index,
    removed: pages[index] as ScanPage | undefined,
    left,
    neighbour: left[index] ?? left[index - 1],
    // Removing the photo under review: on to the next new one, or to the result when none is left.
    nextNew: view === 'corners' ? left.find((p) => !p.reviewed) : undefined,
  };
}

/** The next new photo still waiting for a look, other than `id`. */
export const nextUnreviewed = (pages: ScanPage[], id: number) => pages.find((p) => !p.reviewed && p.id !== id);

/** What the built PDF is keyed by: every page's result key and the settings, once all pages are read; null before. */
export function exportKeyFor(pages: ScanPage[], failedIds: number[], pageSize: string, limit: string): string | null {
  const allGuessed = pages.length > 0 && pages.every((p) => p.guessed) && failedIds.length === 0;
  return allGuessed ? `${pages.map((p) => resultKey(p)).join(',')}|${pageSize}|${limit}` : null;
}
