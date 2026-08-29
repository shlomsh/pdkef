// Sitemap generated from the shared tool + content-page registries
// (src/data/tools.js, src/data/contentPages.js) so it can never drift from
// the actual pages. Prerendered to /sitemap.xml at build time (static
// output). The home page is listed explicitly; every tool and content page
// comes from its registry with its own priority/changefreq.
import { tools } from '../data/tools.js';
import { contentPages } from '../data/contentPages.js';
import { getCollection } from 'astro:content';
import { documentationPath } from '../data/documentationLocales';

const FALLBACK_SITE = 'https://pdkef.com';

export async function GET({ site }) {
  const base = (site ? site.href : FALLBACK_SITE).replace(/\/$/, '');
  // Draft translations are deliberately review-only, including when a local
  // preview build renders them. A sitemap is a publication declaration.
  const publishedLocalizedPages = (await getCollection('localizedPages')).filter(
    (entry) => entry.data.status === 'published',
  );

  const urls = [
    { loc: `${base}/`, changefreq: 'monthly', priority: '1.0' },
    ...tools.map((tool) => ({
      loc: `${base}${tool.href}`,
      changefreq: tool.sitemapChangefreq,
      priority: tool.sitemapPriority,
    })),
    ...contentPages.map((page) => ({
      loc: `${base}${page.href}`,
      changefreq: page.sitemapChangefreq,
      priority: page.sitemapPriority,
    })),
    ...publishedLocalizedPages.map((entry) => ({
      loc: `${base}${documentationPath(entry.data.pageId, entry.data.locale)}`,
      changefreq: 'monthly',
      priority: '0.5',
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
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
