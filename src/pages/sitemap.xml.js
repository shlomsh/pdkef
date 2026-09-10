// Sitemap generated from the shared tool + content-page registries
// (src/data/tools.js, src/data/contentPages.js) so it can never drift from
// the actual pages. Prerendered to /sitemap.xml at build time (static
// output). The home page is listed explicitly; every tool and content page
// comes from its registry with its own priority/changefreq.
import { execSync } from 'node:child_process';
import { tools } from '../data/tools.js';
import { contentPages } from '../data/contentPages.js';
import { getCollection } from 'astro:content';
import { documentationPath } from '../i18n/documentationLocales';

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

  const urls = [
    { loc: `${base}/`, changefreq: 'monthly', priority: '1.0', lastmod: lastmodFor(['src/pages/index.astro']) },
    ...tools.map((tool) => ({
      loc: `${base}${tool.href}`,
      changefreq: tool.sitemapChangefreq,
      priority: tool.sitemapPriority,
      lastmod: lastmodFor([`src/pages/${tool.slug}.astro`, 'src/data/tools.js']),
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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
