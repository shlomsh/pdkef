/**
 * LOC-09: the same locale-routing mechanism src/i18n/localizedTools.ts runs
 * for tool pages, applied to the home page instead. Unlike tools/guides there
 * is no pageId dimension - one home page per locale - so this module is
 * simpler than documentation.ts/localizedTools.ts, not a copy of either.
 * docs/home-page-localization-plan.md, section 5.2.
 */
import { homeContent } from '../data/homeContent.js';
import {
  documentationHomePath,
  getDocumentationLocale,
  type DocumentationLocaleId,
} from './documentationLocales';
import {
  documentationSourceHash,
  validateDocumentationTranslationFreshness,
  type DocumentationFreshness,
  type DocumentationSourceHash,
} from './documentationFreshness';

export type LocalizedHomeStatus = 'draft' | 'published';

/**
 * Every field a localized home edition can override. Keep this in sync with
 * the schema in src/content.config.ts's `localizedHome` collection - that
 * schema is what a localized entry is validated against, this is what its
 * sourceHash is computed from, and they must describe the same fields or a
 * translation could drift without the freshness check noticing (the same
 * relationship TOOL_SOURCE_FIELDS has with content.config.ts's toolFields).
 * Deliberately excludes the trust-chip strings (starOnGithub/mitLicensed/
 * worksOffline) - those already have reviewed catalogue keys in
 * DocumentationShellMessages and are read through that instead.
 */
const HOME_SOURCE_FIELDS = [
  'title',
  'description',
  'h1',
  'h1Accent',
  'subhead',
  'faq',
  'founderStory',
  'draftPersistence',
  'offlineInstall',
  'privacyOpenSource',
  'closing',
] as const;

export function normalizeHomeSource(source: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const field of HOME_SOURCE_FIELDS) normalized[field] = source[field];
  return normalized;
}

export function homeSourceHash(source: Record<string, unknown> = homeContent): DocumentationSourceHash {
  return documentationSourceHash(normalizeHomeSource(source));
}

/** Overlays a localized entry's translated fields onto the English home
 * content object. Anything not in HOME_SOURCE_FIELDS is structural (there is
 * none today) and would come from the English object unchanged, mirroring
 * mergeLocalizedTool in localizedTools.ts. */
export function mergeLocalizedHome(englishHome: Record<string, any>, localizedData: Record<string, any>) {
  const merged = { ...englishHome };
  for (const field of HOME_SOURCE_FIELDS) {
    if (field in localizedData) merged[field] = localizedData[field];
  }
  return merged;
}

// astro:content is a build-only virtual module; see documentation.ts's
// collections() for why this stays behind a literal, non-@vite-ignore'd
// dynamic import instead of a top-level one.
async function localizedHomeEntries() {
  const { getCollection } = (await import('astro:content')) as unknown as {
    getCollection: (name: string) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  };
  return getCollection('localizedHome');
}

function localeId(value: string): DocumentationLocaleId {
  if (!getDocumentationLocale(value)) throw new Error(`Unknown documentation locale: ${value}`);
  return value as DocumentationLocaleId;
}

export interface LocalizedHomeVariant {
  locale: DocumentationLocaleId;
  path: string;
  status: LocalizedHomeStatus | 'english';
  freshness: DocumentationFreshness;
  sourceHash?: DocumentationSourceHash;
  expectedSourceHash?: DocumentationSourceHash;
  entry?: unknown;
}

/**
 * Deliberately simpler than getLocalizedToolVariants/getDocumentationVariants:
 * there is no draft-renders-as-noindex-preview path here. Every entry in the
 * localizedHome collection builds a real, indexable page - a product decision
 * (not an oversight) to skip the separate preview/review-gate step the other
 * two collections use, since a native review happens on the rendered page
 * before publish regardless of what this pipeline does. `status` is kept on
 * the schema/entry for shape parity with localizedTools (and in case a
 * locale is pulled later), but nothing here branches on it - a `status:
 * 'draft'` entry would still build and still be reachable, it would just be
 * excluded from the sitemap/alternates by the `status === 'published'`
 * filter in src/pages/sitemap.xml.js, same as this function's own alternates
 * computation below. sourceHash staleness is still enforced at build time
 * (validateDocumentationTranslationFreshness throws for a published entry
 * whose hash disagrees with the current English source) - that is a content-
 * integrity check, not preview/draft UX, and stays.
 */
export async function getLocalizedHomeVariants(): Promise<LocalizedHomeVariant[]> {
  const entries = await localizedHomeEntries();
  const localizedVariants = entries.map((entry) => {
    const { freshness, expectedSourceHash } = validateDocumentationTranslationFreshness(
      normalizeHomeSource(homeContent),
      {
        id: entry.id,
        pageId: 'home',
        status: entry.data.status as LocalizedHomeStatus,
        sourceHash: entry.data.sourceHash,
      },
    );
    return {
      locale: localeId(entry.data.locale),
      path: documentationHomePath(localeId(entry.data.locale)),
      status: entry.data.status as LocalizedHomeStatus,
      freshness,
      sourceHash: entry.data.sourceHash as DocumentationSourceHash,
      expectedSourceHash,
      entry,
    };
  });

  return [
    {
      locale: 'en' as const,
      path: documentationHomePath('en'),
      status: 'english' as const,
      freshness: 'current' as const,
      sourceHash: homeSourceHash(homeContent),
      entry: homeContent,
    },
    ...localizedVariants,
  ];
}

export async function getLocalizedHomeContext(requestedLocale: string = 'en') {
  const locale = localeId(requestedLocale);
  const allVariants = await getLocalizedHomeVariants();
  const english = allVariants.find((variant) => variant.locale === 'en')!;
  const requested = allVariants.find((variant) => variant.locale === locale);
  const effective = requested ?? english;
  const publishedAlternates = allVariants.filter(
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
    requestedLocale: locale,
    effectiveLocale: effective.locale,
    lang: effective.locale,
    dir: getDocumentationLocale(effective.locale)!.dir,
    path: effective.path,
    freshness: effective.freshness,
    variants: allVariants
      .filter((variant) => variant.status === 'english' || variant.status === 'published')
      .map((variant) => ({
        ...variant,
        nativeName: getDocumentationLocale(variant.locale)!.nativeName,
        isCurrent: variant.locale === effective.locale,
      })),
    alternates,
  };
}
