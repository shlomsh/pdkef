// Sitemap generated from the shared tool + content-page registries
// (src/data/tools.js, src/data/contentPages.js) so it can never drift from
// the actual pages. Prerendered to /sitemap.xml at build time (static
// output). The home page is listed explicitly; every tool and content page
// comes from its registry with its own priority/changefreq.
//
// The <?xml-stylesheet?> PI points at public/sitemap.xsl, which exists
// purely so this renders readably when a human (or Chrome) opens the URL
// directly - once the <xhtml:link> hreflang alternates below were added,
// Chrome stopped showing its default XML tree view for this file (it treats
// any XHTML-namespaced element as "real HTML" and falls back to unstyled
// rendering instead). Search engines ignore the PI and parse the XML as-is;
// see public/sitemap.xsl's own header comment for the full story.
import { tools, toolsBySlug } from '../data/tools.js';
import { contentPages } from '../data/contentPages.js';
import { getCollection } from 'astro:content';
import { documentationPath, documentationHomePath, getDocumentationLocale } from '../i18n/documentationLocales';
import { getLocalizedToolVariants } from '../i18n/localizedTools';
import { getLocalizedHomeVariants } from '../i18n/localizedHome';
import { localizedPageId } from '../i18n/documentation';
import { lastModifiedFor as lastmodFor, documentationSourceFiles } from '../lib/gitLastModified.js';

const FALLBACK_SITE = 'https://pdkef.com';

// lastmod (SEO-01): Google has said for years it largely ignores
// changefreq/priority and does use lastmod when it's accurate - so an
// inaccurate one is worse than none. It's derived from the git commit date
// of the file(s) that back a URL's content (src/lib/gitLastModified.js, which
// the content pages' visible "Last updated" line also reads - SEO-29), never
// hand-maintained, so it cannot drift out of sync with what actually changed.
// Tool pages map to their own `src/pages/<slug>.astro` plus the shared
// `src/data/tools.js` registry every tool's copy (title, FAQ, steps) actually
// lives in - so editing any tool's entry bumps every tool page's lastmod,
// which slightly overstates freshness for the others but never understates
// it, and there is no per-tool file to point at instead without splitting
// that registry apart. Content pages share `src/pages/[contentPage].astro`
// the same way.

function contentPageSlug(page) {
  return page.href.replace(/^\/|\/$/g, '');
}

export async function GET({ site }) {
  const base = (site ? site.href : FALLBACK_SITE).replace(/\/$/, '');
  // Draft translations are deliberately review-only, including when a local
  // preview build renders them. A sitemap is a publication declaration.
  const publishedLocalizedPages = (await getCollection('localizedPages')).filter(
    (entry) => entry.data.status === 'published',
  );

  // LOC-02: localized tool editions. `status === 'published'` is checked here
  // again even though getLocalizedToolVariants already drops drafts outside a
  // PDKEF_DOCS_PREVIEW build: a preview build must still emit a production
  // sitemap, and the guard in verify-seo.js (no draft URL in the sitemap)
  // is what proves it. A locale whose hreflang is undefined in the registry
  // (fil-PH, prs-AF) is listed as a URL but gets no alternate annotation,
  // on any edition, rather than a guessed code.
  const publishedToolEditions = (await getLocalizedToolVariants()).filter(
    (variant) => variant.status === 'published',
  );
  const toolAlternates = (slug) => {
    const editions = [
      { hreflang: 'en', href: `${base}${documentationPath(slug)}` },
      ...publishedToolEditions
        .filter((variant) => variant.toolSlug === slug && getDocumentationLocale(variant.locale).hreflang)
        .map((variant) => ({ hreflang: getDocumentationLocale(variant.locale).hreflang, href: `${base}${variant.path}` })),
    ];
    if (editions.length < 2) return [];
    return [...editions, { hreflang: 'x-default', href: `${base}${documentationPath(slug)}` }];
  };

  // LOC-09: the home page's own alternates group - independent from every
  // tool's (docs/home-page-localization-plan.md, section 6), modeled directly
  // on toolAlternates above. No alternate annotation until a second published
  // edition exists, matching every other page family's rule; a draft
  // localized home (status !== 'published') is excluded by
  // getLocalizedHomeVariants' own filter in a non-preview build, same as
  // getLocalizedToolVariants above.
  const publishedHomeEditions = (await getLocalizedHomeVariants()).filter(
    (variant) => variant.status === 'published',
  );
  const homeAlternates = () => {
    const editions = [
      { hreflang: 'en', href: `${base}${documentationHomePath('en')}` },
      ...publishedHomeEditions
        .filter((variant) => getDocumentationLocale(variant.locale).hreflang)
        .map((variant) => ({ hreflang: getDocumentationLocale(variant.locale).hreflang, href: `${base}${variant.path}` })),
    ];
    if (editions.length < 2) return [];
    return [...editions, { hreflang: 'x-default', href: `${base}${documentationHomePath('en')}` }];
  };

  const urls = [
    {
      loc: `${base}/`,
      changefreq: 'monthly',
      priority: '1.0',
      lastmod: lastmodFor(['src/pages/index.astro', 'src/layouts/HomePageLayout.astro', 'src/data/homeContent.js']),
      alternates: homeAlternates(),
    },
    ...publishedHomeEditions.map((variant) => ({
      loc: `${base}${variant.path}`,
      changefreq: 'monthly',
      priority: '0.9',
      lastmod: lastmodFor([
        `src/content/localized-home/${variant.locale}.yaml`,
        'src/pages/[locale]/index.astro',
        'src/layouts/HomePageLayout.astro',
      ]),
      alternates: homeAlternates(),
    })),
    ...tools.map((tool) => ({
      loc: `${base}${tool.href}`,
      changefreq: tool.sitemapChangefreq,
      priority: tool.sitemapPriority,
      lastmod: lastmodFor([`src/pages/${tool.slug}.astro`, 'src/data/tools.js']),
      alternates: toolAlternates(tool.slug),
    })),
    ...publishedToolEditions.map((variant) => ({
      loc: `${base}${variant.path}`,
      changefreq: toolsBySlug[variant.toolSlug].sitemapChangefreq,
      priority: toolsBySlug[variant.toolSlug].sitemapPriority,
      lastmod: lastmodFor([
        `src/content/localized-tools/${variant.locale}/${variant.toolSlug}.yaml`,
        'src/pages/[locale]/[tool].astro',
      ]),
      alternates: toolAlternates(variant.toolSlug),
    })),
    ...contentPages.map((page) => ({
      loc: `${base}${page.href}`,
      changefreq: page.sitemapChangefreq,
      priority: page.sitemapPriority,
      lastmod: lastmodFor(documentationSourceFiles(contentPageSlug(page))),
    })),
    ...publishedLocalizedPages.map((entry) => ({
      loc: `${base}${documentationPath(localizedPageId(entry), entry.data.locale)}`,
      changefreq: 'monthly',
      priority: '0.5',
      lastmod: lastmodFor(documentationSourceFiles(localizedPageId(entry), entry.data.locale)),
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${(u.alternates ?? [])
      .map((alternate) => `\n    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}" />`)
      .join('')}
  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
