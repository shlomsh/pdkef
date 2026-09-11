// Sitemap generated from the shared tool + content-page registries
// (src/data/tools.js, src/data/contentPages.js) so it can never drift from
// the actual pages. Prerendered to /sitemap.xml at build time (static
// output). The home page is listed explicitly; every tool and content page
// comes from its registry with its own priority/changefreq.
import { execSync } from 'node:child_process';
import { tools, toolsBySlug } from '../data/tools.js';
import { contentPages } from '../data/contentPages.js';
import { getCollection } from 'astro:content';
import { documentationPath, getDocumentationLocale } from '../i18n/documentationLocales';
import { getLocalizedToolVariants } from '../i18n/localizedTools';

const FALLBACK_SITE = 'https://pdkef.com';

// lastmod (SEO-01): Google has said for years it largely ignores
// changefreq/priority and does use lastmod when it's accurate - so an
// inaccurate one is worse than none. It's derived from the git commit date
// of the file(s) that back a URL's content, never hand-maintained, so it
// cannot drift out of sync with what actually changed. Content pages and
// localized pages map to one YAML file each; tool pages map to their own
// `src/pages/<slug>.astro` plus the shared `src/data/tools.js` registry
// every tool's copy (title, FAQ, steps) actually lives in - so editing any
// tool's entry bumps every tool page's lastmod, which slightly overstates
// freshness for the others but never understates it, and there is no
// per-tool file to point at instead without splitting that registry apart.
// The eight content pages share `src/pages/[contentPage].astro` the same
// way. If git history isn't available at build time (e.g. a shallow
// checkout with no .git), we fall back to one shared build timestamp so
// every URL still carries a value rather than lying with a stale date.
const BUILD_TIME = new Date().toISOString();
const gitDateCache = new Map();

function gitFileLastModifiedIso(file) {
  if (gitDateCache.has(file)) return gitDateCache.get(file);
  let iso = null;
  try {
    const out = execSync(`git log -1 --format=%cI -- "${file}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) iso = new Date(out).toISOString();
  } catch {
    iso = null;
  }
  gitDateCache.set(file, iso);
  return iso;
}

function lastmodFor(files) {
  let latest = null;
  for (const file of files) {
    const iso = gitFileLastModifiedIso(file);
    if (iso && (!latest || iso > latest)) latest = iso;
  }
  return latest ?? BUILD_TIME;
}

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

  const urls = [
    { loc: `${base}/`, changefreq: 'monthly', priority: '1.0', lastmod: lastmodFor(['src/pages/index.astro']) },
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
      lastmod: lastmodFor([
        `src/content/content-pages/${contentPageSlug(page)}.yaml`,
        'src/pages/[contentPage].astro',
      ]),
    })),
    ...publishedLocalizedPages.map((entry) => ({
      loc: `${base}${documentationPath(entry.data.pageId, entry.data.locale)}`,
      changefreq: 'monthly',
      priority: '0.5',
      lastmod: lastmodFor([`src/content/localized-pages/${entry.data.locale}/${entry.data.pageId}.yaml`]),
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
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
