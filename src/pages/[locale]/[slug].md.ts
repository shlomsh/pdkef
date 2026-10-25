// Markdown twin of every localized tool page and localized content page:
// /he/sign/ also has /he/sign.md, which middleware.ts serves from the same
// URL on Accept: text/markdown (markdownRoute maps '/he/sign/' to '/he/sign.md').
// Built from the same variant lists and merge helpers the HTML routes use
// ([locale]/<tool>.astro via localizedToolPaths, [locale]/[contentPage].astro),
// so a twin exists exactly when the HTML page does. The localized home twin
// (/he.md) stays in [slug].md.ts, which owns single-segment routes.
import type { APIRoute } from 'astro';
import { toolsBySlug } from '../../data/tools.js';
import { toolToMarkdown, contentPageToMarkdown, markdownLabels } from '../../site-lib/markdownRender.js';
import { documentationSourceFiles, lastModifiedFor } from '../../site-lib/gitLastModified.js';
import { documentationLocales } from '../../i18n/documentationLocales';
import { getDocumentationVariants } from '../../i18n/documentation';
import { getLocalizedToolVariants, mergeLocalizedTool } from '../../i18n/localizedTools';
import { getDocumentationShellMessages } from '../../i18n/documentationMessages';

export async function getStaticPaths() {
  const entryData = (variant: { entry?: unknown }) => (variant.entry as { data: Record<string, any> }).data;
  const prefixOf = (localeId: string) => documentationLocales.find((record) => record.id === localeId)!.prefix;
  const labelsFor = (localeId: string) => markdownLabels(getDocumentationShellMessages(localeId as any));

  const toolEntries = (await getLocalizedToolVariants())
    .filter((variant) => variant.locale !== 'en')
    .map((variant) => ({
      params: { locale: prefixOf(variant.locale), slug: variant.toolSlug },
      props: {
        markdown: toolToMarkdown(mergeLocalizedTool(toolsBySlug[variant.toolSlug], entryData(variant)), {
          path: variant.path,
          labels: labelsFor(variant.locale),
        }),
      },
    }));

  const contentEntries = (await getDocumentationVariants())
    .filter((variant) => variant.locale !== 'en')
    .map((variant) => ({
      params: { locale: prefixOf(variant.locale), slug: variant.pageId },
      props: {
        markdown: contentPageToMarkdown(variant.pageId, entryData(variant), {
          lastModified: lastModifiedFor(documentationSourceFiles(variant.pageId, variant.locale)),
          path: variant.path,
          labels: labelsFor(variant.locale),
        }),
      },
    }));

  const entries = [...toolEntries, ...contentEntries];
  const seen = new Set<string>();
  for (const { params } of entries) {
    const key = `${params.locale}/${params.slug}`;
    if (seen.has(key)) throw new Error(`Localized markdown twin collision: ${key}`);
    seen.add(key);
  }
  return entries;
}

export const GET: APIRoute = async ({ props }) => {
  return new Response(props.markdown as string, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
