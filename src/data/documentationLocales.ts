/**
 * Build-time identity data for documentation editions. This deliberately lives
 * outside the client-facing tool registry: an editor's PDF language support is
 * independent from the languages in which its help has been reviewed.
 */
export const documentationLocales = [
  { id: 'en', nativeName: 'English', dir: 'ltr', prefix: '', hreflang: 'en' },
  { id: 'he', nativeName: 'עברית', dir: 'rtl', prefix: 'he', hreflang: 'he' },
  { id: 'hi', nativeName: 'हिन्दी', dir: 'ltr', prefix: 'hi', hreflang: 'hi' },
  { id: 'fil-PH', nativeName: 'Filipino', dir: 'ltr', prefix: 'fil', hreflang: undefined },
  { id: 'fr-CA', nativeName: 'Français (Canada)', dir: 'ltr', prefix: 'fr-ca', hreflang: 'fr-CA' },
  { id: 'ms', nativeName: 'Bahasa Melayu', dir: 'ltr', prefix: 'ms', hreflang: 'ms' },
  { id: 'ar', nativeName: 'العربية', dir: 'rtl', prefix: 'ar', hreflang: 'ar' },
  { id: 'zh-Hans', nativeName: '简体中文', dir: 'ltr', prefix: 'zh-hans', hreflang: 'zh-Hans' },
  { id: 'es-CO', nativeName: 'Español (Colombia)', dir: 'ltr', prefix: 'es-co', hreflang: 'es-CO' },
  { id: 'prs-AF', nativeName: 'دری', dir: 'rtl', prefix: 'prs-af', hreflang: undefined },
  { id: 'ps-AF', nativeName: 'پښتو', dir: 'rtl', prefix: 'ps-af', hreflang: 'ps-AF' },
  { id: 'ta', nativeName: 'தமிழ்', dir: 'ltr', prefix: 'ta', hreflang: 'ta' },
] as const;

export type DocumentationLocale = (typeof documentationLocales)[number];
export type DocumentationLocaleId = DocumentationLocale['id'];
export type DocumentationDirection = DocumentationLocale['dir'];

export const DOCUMENTATION_LOCALE_IDS = documentationLocales.map(({ id }) => id) as [
  DocumentationLocaleId,
  ...DocumentationLocaleId[],
];

const byId = new Map(documentationLocales.map((locale) => [locale.id, locale]));
const byPrefix = new Map<string, DocumentationLocale>(documentationLocales.map((locale) => [locale.prefix, locale]));

export function getDocumentationLocale(id: string): DocumentationLocale | undefined {
  return byId.get(id as DocumentationLocaleId);
}

export function getDocumentationLocaleByPrefix(prefix: string): DocumentationLocale | undefined {
  return byPrefix.get(prefix);
}

/** The English edition remains root-relative; every other locale has a prefix. */
export function documentationPath(pageId: string, locale: DocumentationLocaleId = 'en'): string {
  const record = getDocumentationLocale(locale);
  if (!record) throw new Error(`Unknown documentation locale: ${locale}`);
  return record.prefix ? `/${record.prefix}/${pageId}/` : `/${pageId}/`;
}
