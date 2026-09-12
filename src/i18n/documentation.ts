import {
  documentationLocales,
  documentationPath,
  getDocumentationLocale,
  type DocumentationLocaleId,
} from './documentationLocales';
import {
  documentationFreshness,
  validateDocumentationTranslationFreshness,
  type DocumentationFreshness,
  type DocumentationSourceHash,
} from './documentationFreshness';

export type DocumentationStatus = 'draft' | 'published';
export type DocumentationVariant = {
  pageId: string;
  locale: DocumentationLocaleId;
  path: string;
  status: DocumentationStatus | 'english';
  preview: boolean;
  freshness: DocumentationFreshness;
  /** LOC-15: native to its locale, no English twin, no alternates. */
  standalone?: boolean;
  sourceHash?: DocumentationSourceHash;
  expectedSourceHash?: DocumentationSourceHash;
  entry?: unknown;
};

export type DocumentationLink = {
  href: string;
  effectiveLocale: DocumentationLocaleId;
  fallback: boolean;
};

export const isDocumentationPreview = () =>
  (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDKEF_DOCS_PREVIEW === '1';

// `astro:content` is a build-only virtual module. Keeping it behind a dynamic
// import lets the link resolver remain an ordinary, fast unit-tested module
// without pulling Astro's content runtime into browser/unit bundles.
//
// The specifier must be a LITERAL, and there must be no `@vite-ignore`. Both
// were here and together they defeated the purpose: `@vite-ignore` on an
// indirect specifier tells Vite not to rewrite the import, so nothing resolved
// the virtual module and the literal string `astro:content` reached Node's ESM
// loader at prerender time - ERR_UNSUPPORTED_ESM_URL_SCHEME, "Received protocol
// 'astro:'", which fails the build on the first page that renders
// The specifier stays literal so Vite resolves the virtual module at build
// time. This code runs only while Astro generates article routes and never
// enters a tool's client bundle.
async function collections() {
  const { getCollection } = (await import('astro:content')) as unknown as {
    getCollection: (name: string) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  };
  return Promise.all([getCollection('contentPages'), getCollection('localizedPages')]);
}

function localeId(value: string): DocumentationLocaleId {
  if (!getDocumentationLocale(value)) throw new Error(`Unknown documentation locale: ${value}`);
  return value as DocumentationLocaleId;
}

/**
 * Resolves article links from the page-specific publication catalog. A caller
 * can use this with `context.variants`; unknown paths are intentionally never
 * locale-prefixed (for example, /sign/ remains the English editor route).
 */
export function resolveDocumentationLink(
  pageId: string,
  requestedLocale: string = 'en',
  variants: readonly Pick<DocumentationVariant, 'pageId' | 'locale' | 'status' | 'preview'>[] = [],
): DocumentationLink {
  const locale = getDocumentationLocale(requestedLocale)?.id ?? 'en';
  const matching = variants.find(
    (variant) =>
      variant.pageId === pageId &&
      variant.locale === locale &&
      (variant.status === 'english' || variant.status === 'published' || variant.preview),
  );
  if (matching) return { href: documentationPath(pageId, locale), effectiveLocale: locale, fallback: false };
  return { href: documentationPath(pageId), effectiveLocale: 'en', fallback: locale !== 'en' };
}

/**
 * The route segment of a localized page entry: the English pageId for a
 * translated twin, the entry's own file name for a standalone page (LOC-15),
 * so `documentationPath` and `documentationSourceFiles` work for both.
 */
export function localizedPageId(entry: { id: string; data: { standalone?: boolean; pageId?: string; locale: string } }): string {
  if (!entry.data.standalone) return entry.data.pageId!;
  const [directory, ...rest] = entry.id.split('/');
  const slug = rest.join('/');
  if (directory !== entry.data.locale || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Standalone documentation ${entry.id} must live at localized-pages/${entry.data.locale}/<slug>.yaml`);
  }
  return slug;
}

export async function getDocumentationVariants(): Promise<DocumentationVariant[]> {
  const [englishEntries, localizedEntries] = await collections();
  const previewBuild = isDocumentationPreview();
  const englishByPageId = new Map(englishEntries.map((entry) => [entry.id, entry]));
  const localizedVariants = localizedEntries
    .map((entry): DocumentationVariant => {
      if (entry.data.standalone) {
        const pageId = localizedPageId(entry as { id: string; data: { standalone?: boolean; pageId?: string; locale: string } });
        if (englishByPageId.has(pageId)) {
          throw new Error(`Standalone documentation ${entry.id} shadows the English page ${pageId}; use a slug of its own`);
        }
        return {
          pageId,
          locale: localeId(entry.data.locale),
          path: documentationPath(pageId, localeId(entry.data.locale)),
          status: entry.data.status as DocumentationStatus,
          preview: entry.data.status === 'draft',
          freshness: 'current',
          standalone: true,
          entry,
        };
      }
      const english = englishByPageId.get(entry.data.pageId);
      if (!english) {
        throw new Error(`Localized documentation ${entry.id} references unknown English page: ${entry.data.pageId}`);
      }
      const { freshness, expectedSourceHash } = validateDocumentationTranslationFreshness(english.data, {
        id: entry.id,
        pageId: entry.data.pageId,
        status: entry.data.status as DocumentationStatus,
        sourceHash: entry.data.sourceHash,
      });
      return {
        pageId: entry.data.pageId,
        locale: localeId(entry.data.locale),
        path: documentationPath(entry.data.pageId, localeId(entry.data.locale)),
        status: entry.data.status as DocumentationStatus,
        preview: entry.data.status === 'draft',
        freshness,
        sourceHash: entry.data.sourceHash as DocumentationSourceHash,
        expectedSourceHash,
        entry,
      };
    })
    .filter((variant) => variant.status === 'published' || previewBuild);
  return [
    ...englishEntries.map((entry) => ({
      pageId: entry.id,
      locale: 'en' as const,
      path: documentationPath(entry.id),
      status: 'english' as const,
      preview: false,
      freshness: 'current' as const,
      sourceHash: documentationFreshness(entry.data, undefined).expectedSourceHash,
      entry,
    })),
    ...localizedVariants,
  ];
}

export async function getDocumentationContext(pageId: string, requestedLocale: string = 'en') {
  const locale = localeId(requestedLocale);
  const allVariants = await getDocumentationVariants();
  const variants = allVariants.filter((variant) => variant.pageId === pageId);
  const english = variants.find((variant) => variant.locale === 'en');
  const requested = variants.find((variant) => variant.locale === locale);
  // LOC-15: a standalone page is its own only edition. It is reachable at
  // its own locale only; there is no English page to fall back to.
  if (!english && !(requested && requested.standalone)) throw new Error(`Unknown documentation page: ${pageId}`);
  const effective = requested ?? variants[0];
  const publishedAlternates = effective.standalone ? [] : variants.filter(
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
        { lang: 'x-default', href: english!.path },
      ]
    : [];

  return {
    entry: effective.entry!,
    pageId,
    requestedLocale: locale,
    effectiveLocale: effective.locale,
    lang: effective.locale,
    dir: getDocumentationLocale(effective.locale)!.dir,
    path: effective.path,
    preview: effective.preview,
    freshness: effective.freshness,
    variants: variants.map((variant) => ({
      ...variant,
      nativeName: getDocumentationLocale(variant.locale)!.nativeName,
      isCurrent: variant.locale === effective.locale,
    })),
    alternates,
    resolveDocumentationLink: (targetPageId: string, targetLocale: string = effective.locale) =>
      resolveDocumentationLink(targetPageId, targetLocale, allVariants),
  };
}

export { documentationLocales };
