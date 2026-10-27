/**
 * ARCH-38: the one list a new tool is added to. Every tool page's slug, href, tool id and the
 * per-tool facts the rest of the app used to keep in nine lists of its own (analytics and rating
 * ids, hand-off pages, what the home dropzone offers a file, which pages have a localized island,
 * which pages take the editor layout) live here, and those lists are derived below.
 *
 * `src/data/tools.js` stays the SEO/content registry (titles, copy, FAQ); a unit test
 * (src/test/cross-tool/toolIds.test.ts) fails when the two name different pages.
 *
 * No imports, and none may be added: `api/report.ts` loads this file through the usage and rating
 * schemas in the deployed function (src/site-lib/functionImports.test.js guards the specifier).
 * Entries are in `src/data/tools.js` order.
 */

export type FileKind = 'pdf' | 'image';

export interface ToolPage {
  /** The page's URL segment. */
  readonly slug: string;
  /** The canonical path, trailing slash included. */
  readonly href: string;
  /** The island this page mounts: what drafts, recents, ratings, analytics and hand-offs key on. */
  readonly id: string;
  /** The `src/tools/<folder>/` that holds the island (Edit Pages is `edit-pages`, Unlock is `security`, Scan is `scan`). */
  readonly folder: string;
  /** The page's English display name: the source of the registry's `gridTitle` in `src/data/tools.js`, which reads it through `labelOf`. */
  readonly label: string;
  /** Set when the page shares its parent's island (a landing-page variant). */
  readonly variantOf?: string;
  /** The key a hand-off to this page is parked under, when it is not `id` (Compress Image opens the Compress island). */
  readonly handoffKey?: string;
  /** What the home dropzone offers this page: the kinds of file it takes, whether several, and whether it needs a PDF among them. */
  readonly accepts?: { readonly kinds: readonly FileKind[]; readonly several: boolean; readonly needsPdf?: boolean };
  /** The island has its own message catalogue, so /he/ and the other editions render it translated. */
  readonly localizedIsland?: true;
  /** Sign and Redact: the editor first screen (icon beside the title, editor restore, offline proof). */
  readonly editorLayout?: true;
  /** Sign and Redact: the hero icon carries the tool's own tone. */
  readonly iconTone?: 'sign' | 'redact';
  /** Merge: a remembered file list restores on load, so the first screen holds for it. */
  readonly restoresFileList?: true;
  /** Merge: the English page says that there is no file limit. */
  readonly unlimitedNote?: true;
  /** A finished output can be handed to this tool (the hand-off row after a download). */
  readonly handoffTarget?: true;
  /** A tool whose protected files detour through Unlock and come back (Unlock's "Continue in ..."). */
  readonly unlockReturn?: true;
}

const PDF: readonly FileKind[] = ['pdf'];
const IMAGE: readonly FileKind[] = ['image'];

export const TOOL_PAGES = [
  { slug: 'sign', href: '/sign/', id: 'sign', folder: 'sign', label: 'Sign & Fill PDF', accepts: { kinds: PDF, several: false }, localizedIsland: true, editorLayout: true, iconTone: 'sign', unlockReturn: true, handoffTarget: true },
  { slug: 'redact', href: '/redact/', id: 'redact', folder: 'redact', label: 'Blur & Redact', accepts: { kinds: PDF, several: false }, editorLayout: true, iconTone: 'redact', unlockReturn: true, handoffTarget: true },
  { slug: 'merge', href: '/merge/', id: 'merge', folder: 'merge', label: 'Merge PDF', accepts: { kinds: ['pdf', 'image'], several: true, needsPdf: true }, localizedIsland: true, restoresFileList: true, unlimitedNote: true, unlockReturn: true, handoffTarget: true },
  { slug: 'pdf-to-image', href: '/pdf-to-image/', id: 'pdf-to-image', folder: 'to-image', label: 'PDF to Image', accepts: { kinds: PDF, several: false }, localizedIsland: true },
  { slug: 'image-to-pdf', href: '/image-to-pdf/', id: 'image-to-pdf', folder: 'image-to-pdf', label: 'Image to PDF', accepts: { kinds: IMAGE, several: true }, localizedIsland: true },
  { slug: 'scan-to-pdf', href: '/scan-to-pdf/', id: 'scan-to-pdf', folder: 'scan', label: 'Scan to PDF' },
  { slug: 'split', href: '/split/', id: 'split', folder: 'split', label: 'Split PDF', accepts: { kinds: PDF, several: false }, localizedIsland: true },
  { slug: 'extract-pdf-pages', href: '/extract-pdf-pages/', id: 'split', folder: 'split', label: 'Extract PDF Pages', variantOf: 'split' },
  { slug: 'compress', href: '/compress/', id: 'compress', folder: 'compress', label: 'Compress PDF', accepts: { kinds: PDF, several: false }, localizedIsland: true, unlockReturn: true, handoffTarget: true },
  { slug: 'compress-image', href: '/compress-image/', id: 'compress-image', folder: 'compress', label: 'Compress Image', handoffKey: 'compress', accepts: { kinds: IMAGE, several: false } },
  { slug: 'unlock', href: '/unlock/', id: 'unlock', folder: 'security', label: 'Protect & Unlock', accepts: { kinds: PDF, several: false } },
  { slug: 'organize-pdf', href: '/organize-pdf/', id: 'edit-pdf', folder: 'edit-pages', label: 'Organize PDF', accepts: { kinds: PDF, several: false }, unlockReturn: true, handoffTarget: true },
  { slug: 'rotate-pdf', href: '/rotate-pdf/', id: 'edit-pdf', folder: 'edit-pages', label: 'Rotate PDF', variantOf: 'organize-pdf' },
  { slug: 'remove-pages', href: '/remove-pages/', id: 'edit-pdf', folder: 'edit-pages', label: 'Remove PDF Pages', variantOf: 'organize-pdf' },
  { slug: 'add-page-numbers-to-pdf', href: '/add-page-numbers-to-pdf/', id: 'edit-pdf', folder: 'edit-pages', label: 'Add Page Numbers to PDF', variantOf: 'organize-pdf' },
] as const satisfies readonly ToolPage[];

/** Protect is a mode of the Unlock page: it counts and rates as itself but has no page of its own. */
const PAGELESS_IDS = ['protect'] as const;

export type ToolId = (typeof TOOL_PAGES)[number]['id'] | (typeof PAGELESS_IDS)[number];

/** Every tool that counts and rates as itself, in page order. The wire schemas validate against it. */
export const TOOL_IDS: readonly ToolId[] = [...new Set<ToolId>([...TOOL_PAGES.map((p) => p.id), ...PAGELESS_IDS])];

const pages: readonly ToolPage[] = TOOL_PAGES;
const pageBySlug = (slug: string) => pages.find((p) => p.slug === slug);

/** The English display name of a listed page; throws for a slug with no row. */
export function labelOf(slug: string): string {
  const page = pageBySlug(slug);
  if (!page) throw new Error(`labelOf: no TOOL_PAGES row for slug "${slug}"`);
  return page.label;
}

/** The key a hand-off to `slug` (or to a tool id) is parked under in the draft store. */
export function handoffKeyOf(slugOrId: string): string {
  const page = pageBySlug(slugOrId);
  return page ? (page.handoffKey ?? page.id) : slugOrId;
}

/** The listed page of a tool id, for a hand-off to navigate to; undefined for an id with no page (Protect). */
export function handoffHrefOf(id: string): string | undefined {
  return pages.find((p) => p.id === id && !p.variantOf)?.href;
}

/** hand-off key -> every page slug that key opens (variants and Compress Image share an island). */
export function pageSlugsForHandoffKey(key: string): string[] {
  const slugs = pages.filter((p) => handoffKeyOf(p.slug) === key).map((p) => p.slug);
  return slugs.length ? slugs : [key];
}

/** The page slugs whose island has its own message catalogue. */
export const LOCALIZED_ISLAND_SLUGS: readonly string[] = pages.filter((p) => p.localizedIsland).map((p) => p.slug);

/** What the home dropzone can offer a file, in page order. */
export const FILE_CAPABILITIES = pages.flatMap((p) => (p.accepts ? [{ slug: p.slug, ...p.accepts }] : []));

export type HandoffTargetId = Extract<(typeof TOOL_PAGES)[number], { handoffTarget: true }>['id'];

/** The tools Redact's done state hands a finished file to (a subset of the registry's hand-off targets). */
export type RedactHandoffTarget = Extract<HandoffTargetId, 'compress' | 'sign'>;

/** The two tools that run on the shared editor core. */
export type EditorToolId = Extract<HandoffTargetId, 'sign' | 'redact'>;

export type UnlockReturnId = Extract<(typeof TOOL_PAGES)[number], { unlockReturn: true }>['id'];

/** The tool ids whose protected files detour through Unlock. */
export const UNLOCK_RETURN_IDS = TOOL_PAGES.filter((p) => 'unlockReturn' in p).map((p) => p.id) as readonly UnlockReturnId[];

/** Page slugs by layout flag, for the one script that cannot call `layoutOf` (the hashed pre-paint script in ToolPageLayout.astro). */
export const EDITOR_LAYOUT_SLUGS: readonly string[] = pages.filter((p) => p.editorLayout).map((p) => p.slug);
export const FILE_LIST_RESTORE_SLUGS: readonly string[] = pages.filter((p) => p.restoresFileList).map((p) => p.slug);

/** The registry flags for one page (layout decisions), all false for a slug that is not listed. */
export function layoutOf(slug: string) {
  const page = pageBySlug(slug);
  return {
    editorLayout: Boolean(page?.editorLayout),
    iconTone: page?.iconTone,
    restoresFileList: Boolean(page?.restoresFileList),
    unlimitedNote: Boolean(page?.unlimitedNote),
  };
}
