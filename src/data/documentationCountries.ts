// Audience countries are a help-discovery reference, not language detection or
// a claim about legal acceptance / PDF font coverage. One country can have
// several documentation languages, and one language can serve many countries.
export const documentationCountries = [
  { code: 'IL', name: 'Israel', locales: ['he', 'en', 'ar'] },
  { code: 'US', name: 'United States of America', locales: ['en'] },
  { code: 'IN', name: 'India', locales: ['en', 'hi', 'ta'] },
  { code: 'GB', name: 'United Kingdom', locales: ['en'] },
  { code: 'PH', name: 'Philippines', locales: ['en', 'fil-PH'] },
  { code: 'CA', name: 'Canada', locales: ['en', 'fr-CA'] },
  { code: 'MY', name: 'Malaysia', locales: ['en', 'ms'] },
  { code: 'SG', name: 'Singapore', locales: ['en', 'zh-Hans', 'ms', 'ta'] },
  { code: 'AE', name: 'United Arab Emirates', locales: ['ar', 'en'] },
  { code: 'AF', name: 'Afghanistan', locales: ['prs-AF', 'ps-AF', 'en'] },
  { code: 'CN', name: "People's Republic of China", locales: ['zh-Hans', 'en'] },
  { code: 'CO', name: 'Colombia', locales: ['es-CO', 'en'] },
] as const;
