import {
  documentationLocales,
  documentationPath,
  getDocumentationLocale,
  type DocumentationLocaleId,
} from '../data/documentationLocales';

export type DocumentationStatus = 'draft' | 'published';
export type DocumentationVariant = {
  pageId: string;
  locale: DocumentationLocaleId;
  path: string;
  status: DocumentationStatus | 'english';
  preview: boolean;
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
// DocumentationCoverage. A literal specifier is still lazy (the module loads
// only when this function is called) but Vite resolves it at build time.
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

export async function getDocumentationVariants(): Promise<DocumentationVariant[]> {
  const [englishEntries, localizedEntries] = await collections();
  const previewBuild = isDocumentationPreview();
  return [
    ...englishEntries.map((entry) => ({
      pageId: entry.id,
      locale: 'en' as const,
      path: documentationPath(entry.id),
      status: 'english' as const,
      preview: false,
      entry,
    })),
    ...localizedEntries
      .filter((entry) => entry.data.status === 'published' || previewBuild)
      .map((entry) => ({
        pageId: entry.data.pageId,
        locale: localeId(entry.data.locale),
        path: documentationPath(entry.data.pageId, localeId(entry.data.locale)),
        status: entry.data.status as DocumentationStatus,
        preview: entry.data.status === 'draft',
        entry,
      })),
  ];
}

export async function getDocumentationContext(pageId: string, requestedLocale: string = 'en') {
  const locale = localeId(requestedLocale);
  const allVariants = await getDocumentationVariants();
  const variants = allVariants.filter((variant) => variant.pageId === pageId);
  const english = variants.find((variant) => variant.locale === 'en');
  if (!english) throw new Error(`Unknown documentation page: ${pageId}`);
  const requested = variants.find((variant) => variant.locale === locale);
  const effective = requested ?? variants[0];
  const publishedAlternates = variants.filter(
    (variant) =>
      (variant.status === 'english' || variant.status === 'published') &&
      getDocumentationLocale(variant.locale)!.hreflang,
  );

  return {
    entry: effective.entry!,
    pageId,
    requestedLocale: locale,
    effectiveLocale: effective.locale,
    lang: effective.locale,
    dir: getDocumentationLocale(effective.locale)!.dir,
    path: effective.path,
    preview: effective.preview,
    variants: variants.map((variant) => ({
      ...variant,
      nativeName: getDocumentationLocale(variant.locale)!.nativeName,
      isCurrent: variant.locale === effective.locale,
    })),
    alternates: publishedAlternates.map((variant) => ({
      lang: getDocumentationLocale(variant.locale)!.hreflang!,
      href: variant.path,
    })),
    resolveDocumentationLink: (targetPageId: string, targetLocale = effective.locale) =>
      resolveDocumentationLink(targetPageId, targetLocale, allVariants),
  };
}

export { documentationLocales };
