// Site-wide Organization + WebSite JSON-LD, rendered once per page by
// src/components/OrganizationSchema.astro. Kept as data (not inline in the
// component) so organizationSchema.test.js can pin its shape and cross-check
// it against the pages it points at - the same "one source, several
// renderers" rule every other schema here follows.
//
// This is the entity graph a search engine or an agent uses to recognize
// "PDkef" as one real, identifiable thing rather than a bare domain name -
// the schema equivalent of the /about, /contact and /privacy trust-anchor
// pages, and it must only ever say what those pages say.

export const SITE_URL = 'https://pdkef.com/';
export const GITHUB_REPO_URL = 'https://github.com/shlomsh/pdkef';

// The one real support channel, and the same link /contact/ leads with
// (src/data/staticPages.js). There is no support inbox or phone line, so
// the ContactPoint carries a url and no email/telephone - schema.org
// requires neither, and inventing one would be worse than omitting it.
export const SUPPORT_CONTACT_URL = `${GITHUB_REPO_URL}/issues/new`;

export const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'PDkef',
  url: SITE_URL,
  logo: 'https://pdkef.com/icons/icon-512.png',
  description:
    'PDkef is a free, open-source suite of PDF tools that run entirely in the browser, built and maintained by Shlomi Shemesh.',
  founder: { '@type': 'Person', name: 'Shlomi Shemesh', url: 'https://github.com/shlomsh' },
  sameAs: [GITHUB_REPO_URL, 'https://github.com/shlomsh'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: SUPPORT_CONTACT_URL,
    availableLanguage: ['English', 'Hebrew'],
  },
};

export const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'PDkef',
  url: SITE_URL,
  description:
    'A free, open-source suite of PDF tools that run entirely in your browser. Merge, sign, split, redact, compress, and convert PDFs with nothing uploaded, no account, and no watermark.',
  publisher: { '@type': 'Organization', name: 'PDkef', url: SITE_URL },
};
