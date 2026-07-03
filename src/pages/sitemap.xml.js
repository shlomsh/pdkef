// Sitemap generated from the shared tool registry (src/data/tools.js) so it can
// never drift from the actual tool pages. Prerendered to /sitemap.xml at build
// time (static output). The home page is listed explicitly; every tool comes
// from the registry with its per-tool priority/changefreq.
import { tools } from '../data/tools.js';

const FALLBACK_SITE = 'https://pdkef.vercel.app';

export function GET({ site }) {
  const base = (site ? site.href : FALLBACK_SITE).replace(/\/$/, '');

  const urls = [
    { loc: `${base}/`, changefreq: 'monthly', priority: '1.0' },
    ...tools.map((tool) => ({
      loc: `${base}${tool.href}`,
      changefreq: tool.sitemapChangefreq,
      priority: tool.sitemapPriority,
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
