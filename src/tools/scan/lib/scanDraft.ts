import { type Quad } from '#lib/pageEnhance/quad.ts';
import { quadKey } from './quad.ts';
import type { ScanFilter } from './filters.ts';
import type { PageSize } from './scanPipeline.ts';
import type { SizeLimitId } from './scanBudget.ts';
import type { ScanPage } from '../state/scanWork.ts';

/**
 * SCAN-18: what a scan in progress keeps in the shared on-device memory space (draftStore.ts), and how it
 * comes back. The photos are the entry's `files`, in page order; this is `work['scan-to-pdf']` beside them.
 *
 * A page keeps what the person chose: its look, its turns, and its corners only once they set them. Corners
 * the edge guess found are not stored: the guess runs again on restore and finds the same ones, so storing
 * them would only make a restored scan look changed the moment its guess lands.
 *
 * This module is the one place that knows what a page keeps. The processing (straightening, dewarping, looks)
 * runs again from the photo on restore, so it never needs persisting; only a choice the person makes does.
 * A new per-page choice on ScanPage goes in `storedPage`, `parsePage` and `scanSnapshotKey` here, and nowhere else.
 */
export const SCAN_DRAFT_SCHEMA_VERSION = 1;
export const SCAN_DRAFT_TOOL = 'scan-to-pdf';

interface StoredScanPage {
  filter: ScanFilter;
  turns: number;
  /** The person's own corners; null while the page has the guess (or the whole photo). */
  quad: Quad | null;
}

export interface ScanDraftSettings {
  pageSize: PageSize;
  limit: SizeLimitId;
  /** The name the PDF downloads under, as shown. */
  name: string;
  /** The look a new photo starts with. */
  defaultFilter: ScanFilter;
}

export interface ScanDraftRestore {
  files: File[];
  pages: StoredScanPage[];
  /** Only the settings the record held and that are still valid; the rest keep their defaults. */
  settings: Partial<ScanDraftSettings>;
}

const FILTERS: readonly ScanFilter[] = ['original', 'grayscale', 'document'];
const PAGE_SIZES: readonly PageSize[] = ['fit', 'a4', 'letter'];
const LIMITS: readonly SizeLimitId[] = ['none', '2mb', '1mb', '500kb'];

/** The page as stored. */
export const storedPage = (page: ScanPage): StoredScanPage => ({
  filter: page.filter, turns: page.turns, quad: page.edited ? page.quad : null,
});

/** One string per snapshot worth saving: changes only when a stored field does. `fileId` tells photos apart. */
export function scanSnapshotKey(pages: ScanPage[], settings: ScanDraftSettings, fileId: (file: File) => number): string {
  const pagesPart = pages.map((page) => {
    const { filter, turns, quad } = storedPage(page);
    return `${fileId(page.file)}:${filter}:${turns}:${quad ? quadKey(quad) : ''}`;
  }).join(',');
  return `${pagesPart}|${settings.pageSize}|${settings.limit}|${settings.defaultFilter}|${settings.name}`;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function parseQuad(value: unknown): Quad | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const valid = value.every((point) => point && isNumber(point.x) && isNumber(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
  return valid ? (value.map((point) => ({ x: point.x, y: point.y })) as Quad) : null;
}

function parsePage(value: unknown, fallbackFilter: ScanFilter): StoredScanPage {
  const page = (value ?? {}) as { filter?: unknown; turns?: unknown; quad?: unknown };
  return {
    filter: FILTERS.includes(page.filter as ScanFilter) ? page.filter as ScanFilter : fallbackFilter,
    turns: Number.isInteger(page.turns) && (page.turns as number) >= 0 && (page.turns as number) < 4 ? page.turns as number : 0,
    quad: parseQuad(page.quad),
  };
}

interface StoredScanRecord {
  files?: unknown;
  schemaVersion?: unknown;
  pages?: unknown;
  pageSize?: unknown;
  limit?: unknown;
  name?: unknown;
  defaultFilter?: unknown;
}

/**
 * The scan a stored record holds, or null when it holds no photos. A record whose scan work is missing or from
 * another version still restores its photos, as new pages: an entry kept after Clear all (which drops only
 * the work) opens from Recents as the photos it was.
 */
export function parseScanDraft(stored: unknown): ScanDraftRestore | null {
  const record = stored as StoredScanRecord | null | undefined;
  if (!record || !Array.isArray(record.files) || record.files.length === 0) return null;
  const storedFiles = record.files as { fileBytes?: BlobPart; fileName?: unknown; fileType?: unknown }[];
  if (!storedFiles.every((file) => file && file.fileBytes)) return null;
  const files = storedFiles.map((file, index) => new File(
    [file.fileBytes as BlobPart],
    typeof file.fileName === 'string' && file.fileName ? file.fileName : `page-${index + 1}.jpg`,
    { type: typeof file.fileType === 'string' && file.fileType ? file.fileType : 'image/jpeg' },
  ));
  const current = record.schemaVersion === SCAN_DRAFT_SCHEMA_VERSION;
  const defaultFilter = current && FILTERS.includes(record.defaultFilter as ScanFilter) ? record.defaultFilter as ScanFilter : undefined;
  const storedPages = current && Array.isArray(record.pages) && record.pages.length === files.length ? record.pages : null;
  const pages = files.map((_, index) => parsePage(storedPages?.[index], defaultFilter ?? 'document'));
  const settings: Partial<ScanDraftSettings> = {};
  if (current) {
    if (PAGE_SIZES.includes(record.pageSize as PageSize)) settings.pageSize = record.pageSize as PageSize;
    if (LIMITS.includes(record.limit as SizeLimitId)) settings.limit = record.limit as SizeLimitId;
    if (typeof record.name === 'string' && record.name.length > 0) settings.name = record.name;
    if (defaultFilter) settings.defaultFilter = defaultFilter;
  }
  return { files, pages, settings };
}
