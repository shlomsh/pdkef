/**
 * LOC-02: the same locale-routing mechanism documentation.ts already runs for
 * standalone guides, applied to tool pages instead. The English source here
 * is not a content-collection entry - it's an object literal in
 * src/data/tools.js - so this module (not content.config.ts) is what
 * cross-checks a localized entry's sourceHash against the normalized English
 * tool, mirroring validateDocumentationTranslationFreshness's role for guides.
 */
import { tools, toolsBySlug } from '../data/tools.js';
import {
  getDocumentationLocale,
  documentationPath,
  type DocumentationLocaleId,
} from './documentationLocales';
import {
  documentationSourceHash,
  validateDocumentationTranslationFreshness,
  type DocumentationFreshness,
  type DocumentationSourceHash,
} from './documentationFreshness';
import { getDocumentationVariants, isDocumentationPreview } from './documentation';
// One-way: localizedHome.ts reads documentationLocales/documentationFreshness
// and src/data/homeContent.js, never this module, so this import adds no cycle.
import { getLocalizedHomeVariants } from './localizedHome';

export type LocalizedToolStatus = 'draft' | 'published';

/**
 * Everything a crawler reads on a tool page, and nothing else (icon, slug,
 * href, sitemap priority, and the aboutSketch/faqSketch decoration are
 * visual/structural, not text, and stay English-object-derived on every
 * locale - see mergeLocalizedTool). Keep this list in sync with the
 * toolFields schema in content.config.ts; that schema is what a localized
 * entry is validated against, this is what its sourceHash is computed from,
 * and they must describe the same fields or a translation could drift
 * without the freshness check ever noticing.
 */
const TOOL_SOURCE_FIELDS = [
  'seoTitle',
  'seoDescription',
  'schemaName',
  'toolName',
  'h1',
  'subhead',
  'ariaLabel',
  'aboutHeading',
  'aboutLead',
  'freeNoteLead',
  'steps',
  'faq',
] as const;

export function normalizeToolSource(tool: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const field of TOOL_SOURCE_FIELDS) normalized[field] = tool[field];
  return normalized;
}

export function toolSourceHash(tool: Record<string, unknown>): DocumentationSourceHash {
  return documentationSourceHash(normalizeToolSource(tool));
}

/** Overlays a localized entry's translated text fields onto the English tool
 * object. Everything not in TOOL_SOURCE_FIELDS (icon, slug, href, sketches,
 * sitemap metadata, condenseOnLoad, languages...) is visual or structural and
 * comes from the English tool unchanged - a locale never re-decides what the
 * page looks like, only what it says. */
export function mergeLocalizedTool(englishTool: Record<string, any>, localizedData: Record<string, any>) {
  const merged = { ...englishTool };
  for (const field of TOOL_SOURCE_FIELDS) {
    if (field in localizedData) merged[field] = localizedData[field];
  }
  return merged;
}

// astro:content is a build-only virtual module; see documentation.ts's
// collections() for why this stays behind a literal, non-@vite-ignore'd
// dynamic import instead of a top-level one.
async function localizedToolEntries() {
  const { getCollection } = (await import('astro:content')) as unknown as {
    getCollection: (name: string) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  };
  return getCollection('localizedTools');
}

function localeId(value: string): DocumentationLocaleId {
  if (!getDocumentationLocale(value)) throw new Error(`Unknown documentation locale: ${value}`);
  return value as DocumentationLocaleId;
}

export interface LocalizedToolVariant {
  toolSlug: string;
  locale: DocumentationLocaleId;
  path: string;
  status: LocalizedToolStatus | 'english';
  preview: boolean;
  freshness: DocumentationFreshness;
  sourceHash?: DocumentationSourceHash;
  expectedSourceHash?: DocumentationSourceHash;
  entry?: unknown;
}

export async function getLocalizedToolVariants(): Promise<LocalizedToolVariant[]> {
  const entries = await localizedToolEntries();
  const previewBuild = isDocumentationPreview();
  const localizedVariants = entries
    .map((entry) => {
      const englishTool = toolsBySlug[entry.data.toolSlug];
      if (!englishTool) {
        throw new Error(`Localized tool ${entry.id} references unknown tool: ${entry.data.toolSlug}`);
      }
      const { freshness, expectedSourceHash } = validateDocumentationTranslationFreshness(
        normalizeToolSource(englishTool),
        {
          id: entry.id,
          pageId: entry.data.toolSlug,
          status: entry.data.status as LocalizedToolStatus,
          sourceHash: entry.data.sourceHash,
        },
      );
      return {
        toolSlug: entry.data.toolSlug as string,
        locale: localeId(entry.data.locale),
        path: documentationPath(entry.data.toolSlug, localeId(entry.data.locale)),
        status: entry.data.status as LocalizedToolStatus,
        preview: entry.data.status === 'draft',
        freshness,
        sourceHash: entry.data.sourceHash as DocumentationSourceHash,
        expectedSourceHash,
        entry,
      };
    })
    .filter((variant) => variant.status === 'published' || previewBuild);

  return [
    ...tools.map((tool) => ({
      toolSlug: tool.slug as string,
      locale: 'en' as const,
      path: documentationPath(tool.slug),
      status: 'english' as const,
      preview: false,
      freshness: 'current' as const,
      sourceHash: toolSourceHash(tool),
      entry: tool,
    })),
    ...localizedVariants,
  ];
}

export async function getLocalizedToolContext(toolSlug: string, requestedLocale: string = 'en') {
  const locale = localeId(requestedLocale);
  const allVariants = await getLocalizedToolVariants();
  const variants = allVariants.filter((variant) => variant.toolSlug === toolSlug);
  const english = variants.find((variant) => variant.locale === 'en');
  if (!english) throw new Error(`Unknown tool: ${toolSlug}`);
  const requested = variants.find((variant) => variant.locale === locale);
  const effective = requested ?? variants[0];
  const publishedAlternates = variants.filter(
    (variant) =>
      (variant.status === 'english' || variant.status === 'published') &&
      getDocumentationLocale(variant.locale)!.hreflang,
  );
  const alternates = publishedAlternates.length > 1
    ? [
        ...publishedAlternates.map((variant) => ({
          lang: getDocumentationLocale(variant.locale)!.hreflang!,
          href: variant.path,
        })),
        { lang: 'x-default', href: english.path },
      ]
    : [];

  return {
    entry: effective.entry!,
    toolSlug,
    requestedLocale: locale,
    effectiveLocale: effective.locale,
    lang: effective.locale,
    dir: getDocumentationLocale(effective.locale)!.dir,
    path: effective.path,
    preview: effective.preview,
    freshness: effective.freshness,
    variants: variants
      .filter((variant) => variant.status === 'english' || variant.status === 'published' || variant.preview)
      .map((variant) => ({
        ...variant,
        nativeName: getDocumentationLocale(variant.locale)!.nativeName,
        isCurrent: variant.locale === effective.locale,
      })),
    alternates,
  };
}

/**
 * Tool slugs whose island component accepts a localized `messages` prop.
 * Every other tool's editor stays English (the Sign/Redact pilot decision
 * from docs/app-documentation-localization-plan.md), so a localizedTools
 * entry for a slug not in this set renders its island in English behind the
 * shell's "controls are in English" notice rather than claiming a
 * translation that does not exist. Add a slug here only once that tool's
 * component actually has a reviewed message catalogue (src/i18n/toolMessages.ts)
 * and the .astro route below wires it up.
 */
export const LOCALIZED_TOOL_ISLANDS = new Set(['merge', 'compress']);

/**
 * Every published page of one edition - the locale's home page, its tool
 * pages and its guides - as site paths, for the offline locale pack a
 * localized page asks sw.js to warm (LOC-02). Published only, whatever the
 * build mode: a draft has nothing to warm, and the pack a page names is one
 * of verify-seo's guards.
 *
 * The home edition (LOC-09) has to be in here, and was missed when the
 * collection landed. sw.js's navigation fallback is `/` - the *English*
 * shell - so a locale root left out of its own pack is the one page in the
 * edition an installed PWA answers in the wrong language offline.
 */
export async function getPublishedEditionPaths(locale: DocumentationLocaleId): Promise<string[]> {
  const [homeVariants, toolVariants, guideVariants] = await Promise.all([
    getLocalizedHomeVariants(),
    getLocalizedToolVariants(),
    getDocumentationVariants(),
  ]);
  return [...homeVariants, ...toolVariants, ...guideVariants]
    .filter((variant) => variant.locale === locale && variant.status === 'published')
    .map((variant) => variant.path)
    .sort();
}

/**
 * LOC-05: the one decision ToolCrossLinks and RelatedGuides already make per
 * card (`published.has(localizedHref) ? localizedHref : englishHref`, in
 * reverse - here the caller already knows which href it landed on and only
 * needs to know whether that's a fallback), pulled out so a third caller
 * (a content page's primaryCta, which is authored as a plain href rather than
 * a pageId a card can re-derive a localized variant from) asks the same
 * question instead of re-deciding it its own way. English is trivially "in
 * its own edition"; any other locale is in its edition only if `href` is one
 * of that locale's own published paths from `getPublishedEditionPaths`.
 */
export function isPublishedEditionLink(
  href: string,
  locale: string,
  editionPaths: readonly string[],
): boolean {
  return locale === 'en' || editionPaths.includes(href);
}
