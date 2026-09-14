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
import { homeContent } from '../data/homeContent.js';
import { toolToMarkdown, contentPageToMarkdown, staticPageToMarkdown, homeToMarkdown } from '../site-lib/markdownRender.js';
import { documentationSourceFiles, lastModifiedFor } from '../site-lib/gitLastModified.js';
import { getLocalizedHomeVariants, mergeLocalizedHome } from '../i18n/localizedHome';
import { getPublishedEditionPaths } from '../i18n/localizedTools';
import { documentationLocales, documentationPath } from '../i18n/documentationLocales';
import { getToolCardCopy } from '../i18n/cardMessages';

export async function getStaticPaths() {
  const toolEntries = tools.map((tool) => ({
    params: { slug: tool.href.replace(/^\/|\/$/g, '') },
    props: { markdown: toolToMarkdown(tool) },
  }));

  const contentPageEntries = await getCollection('contentPages');
  const contentEntries = contentPageEntries.map((entry) => ({
    params: { slug: entry.id },
    props: { markdown: contentPageToMarkdown(entry.id, entry.data, { lastModified: lastModifiedFor(documentationSourceFiles(entry.id)) }) },
  }));

  const staticEntries = staticPages.map((page) => ({
    params: { slug: page.slug },
    props: { markdown: staticPageToMarkdown(page) },
  }));

  // LOC-16 item 5: a localized home edition's root ('/he/') is still a
  // single path segment ('he'), so it fits this file's existing scope
  // (single-segment routes only, per the header comment) rather than
  // needing its own route file - a second top-level `[locale].md.ts` would
  // collide with this one's route pattern anyway. Published editions only,
  // mirroring HomePageLayout.astro's own localization: h1/description/faq
  // through mergeLocalizedHome, each tool's dock title/description through
  // getToolCardCopy (falling back to the English gridTitle/gridDescription),
  // and its href through the same published-edition-or-English-fallback
  // logic HomePageLayout uses for the dock, so this twin cannot link
  // somewhere the rendered page doesn't.
  const localeHomeVariants = (await getLocalizedHomeVariants()).filter(
    (variant) => variant.locale !== 'en' && variant.status === 'published',
  );
  const localeHomeEntries = await Promise.all(
    localeHomeVariants.map(async (variant) => {
      const locale = documentationLocales.find((record) => record.id === variant.locale)!;
      if (toolEntries.some((entry) => entry.params.slug === locale.prefix)
        || contentEntries.some((entry) => entry.params.slug === locale.prefix)
        || staticEntries.some((entry) => entry.params.slug === locale.prefix)) {
        throw new Error(`Locale prefix "${locale.prefix}" collides with an existing markdown-twin slug`);
      }
      const home = mergeLocalizedHome(homeContent, (variant.entry as { data: Record<string, any> }).data);
      const editionPaths = new Set(await getPublishedEditionPaths(variant.locale));
      const localizedTools = tools.map((tool) => {
        const copy = getToolCardCopy(variant.locale, tool.slug);
        const localizedHref = documentationPath(tool.slug, variant.locale);
        return {
          toolName: copy?.title ?? tool.gridTitle,
          href: editionPaths.has(localizedHref) ? localizedHref : tool.href,
          gridDescription: copy?.description ?? tool.gridDescription,
        };
      });
      return {
        params: { slug: locale.prefix },
        props: { markdown: homeToMarkdown({ ...home, tools: localizedTools, path: variant.path } as any) },
      };
    }),
  );

  return [...toolEntries, ...contentEntries, ...staticEntries, ...localeHomeEntries];
}

export const GET: APIRoute = async ({ props }) => {
  return new Response(props.markdown as string, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
