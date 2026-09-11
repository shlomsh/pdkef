// Markdown twin of every tool page, content page, and trust-anchor static
// page - /sign/ also has a plain-text /sign.md, per the llms.txt convention
// ("provide a clean markdown version of those pages... with the extension
// replaced by .md"). Pre-rendered at build time like every other static
// endpoint here (see sitemap.xml.js); middleware.ts is what serves this
// content from the *same* URL as the HTML page when a request negotiates
// Accept: text/markdown - this endpoint is what middleware.ts fetches from.
//
// Only single-segment routes (every current tool/content/static page) are
// covered; there is deliberately no rest-param catch-all, so a future nested
// route fails this file's own getStaticPaths cross-check (mirroring
// [contentPage].astro's own orphan/missing check) instead of silently having
// no markdown twin.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { tools } from '../data/tools.js';
import { staticPages } from '../data/staticPages.js';
import { toolToMarkdown, contentPageToMarkdown, staticPageToMarkdown } from '../lib/markdownRender.js';

export async function getStaticPaths() {
  const toolEntries = tools.map((tool) => ({
    params: { slug: tool.href.replace(/^\/|\/$/g, '') },
    props: { markdown: toolToMarkdown(tool) },
  }));

  const contentPageEntries = await getCollection('contentPages');
  const contentEntries = contentPageEntries.map((entry) => ({
    params: { slug: entry.id },
    props: { markdown: contentPageToMarkdown(entry.id, entry.data) },
  }));

  const staticEntries = staticPages.map((page) => ({
    params: { slug: page.slug },
    props: { markdown: staticPageToMarkdown(page) },
  }));

  return [...toolEntries, ...contentEntries, ...staticEntries];
}

export const GET: APIRoute = async ({ props }) => {
  return new Response(props.markdown as string, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
