/**
 * LOC-02 / ARCH-33: the pure half of a localized tool page. Each tool has its
 * own route file in src/pages/[locale]/<slug>.astro (so a page imports and
 * inlines only its own island's CSS); every route calls `localizedToolPaths`
 * for getStaticPaths and `loadLocalizedToolPage` for the context its layout
 * (LocalizedToolLayout.astro) renders. Same locale-routing pattern, reviewer/
 * sourceHash gate and draft -> noindex-preview behaviour as
 * [locale]/[contentPage].astro.
 *
 * Adding a localized tool means: publish a localizedTools entry
 * (src/content/localized-tools/<locale>/<tool>.yaml), add the route file
 * src/pages/[locale]/<tool>.astro (localizedToolPage.test.ts fails without
 * it), and, if the island accepts a `messages` prop, add the slug to
 * LOCALIZED_TOOL_ISLANDS. Until then the page still builds, rendering the
 * tool's real component in English behind the "controls are in English"
 * notice ToolPageLayout shows for that case.
 */
import { documentationLocales, getDocumentationLocaleByPrefix } from '../i18n/documentationLocales';
import {
  getLocalizedToolContext,
  getLocalizedToolVariants,
  mergeLocalizedTool,
  LOCALIZED_TOOL_ISLANDS,
} from '../i18n/localizedTools';
import { getDocumentationShellMessages } from '../i18n/documentationMessages';
import { getToolMessages, type ToolMessageSlug, type ToolMessagesFor } from './toolMessageRegistry';
import { getShellMessages } from '../shell/shellMessages';
import { toolsBySlug } from '../data/tools.js';

export async function localizedToolPaths(toolSlug: string) {
  const variants = await getLocalizedToolVariants();
  return variants
    .filter((variant) => variant.locale !== 'en' && variant.toolSlug === toolSlug)
    .map((variant) => {
      const locale = documentationLocales.find((record) => record.id === variant.locale)!;
      return {
        params: { locale: locale.prefix },
        props: { toolSlug: variant.toolSlug, localeId: variant.locale },
      };
    });
}

async function loadLocalizedToolPageImpl(toolSlug: string, localeId: string, routePrefix: string) {
  const routeLocale = getDocumentationLocaleByPrefix(routePrefix);
  if (!routeLocale || routeLocale.id !== localeId) {
    throw new Error(`Invalid localized tool route: ${routePrefix}`);
  }

  const englishTool = toolsBySlug[toolSlug];
  if (!englishTool) throw new Error(`Localized tool route references unknown tool: ${toolSlug}`);

  const context = await getLocalizedToolContext(toolSlug, localeId);
  const tool = context.effectiveLocale === 'en'
    ? englishTool
    : mergeLocalizedTool(englishTool, (context.entry as { data: Record<string, any> }).data);

  const messages = getDocumentationShellMessages(context.effectiveLocale);
  // ARCH-09's freshness gate, same as guides: a stale draft still previews, with
  // the more specific "needs review" notice rather than the plain draft one.
  const stale = context.preview && context.freshness === 'stale';

  const islandLocalized = LOCALIZED_TOOL_ISLANDS.has(toolSlug);
  const shellMessages = getShellMessages(context.effectiveLocale);
  const toolMessages = islandLocalized ? getToolMessages(toolSlug, context.effectiveLocale) : undefined;

  // The island is localized too, or the page is not (LOC-02.md). A published
  // page claiming a localized island but missing that locale's reviewed
  // message catalogue is a build error, not a silent English fallback.
  if (context.entry && (context.entry as any).data?.status === 'published' && islandLocalized && !toolMessages) {
    throw new Error(
      `${toolSlug}/${context.effectiveLocale} is published but has no reviewed island message catalogue in the tool's messages.ts`,
    );
  }

  return { toolSlug, context, tool, messages, stale, islandLocalized, shellMessages, toolMessages };
}

/** Per-slug typing: the page's `toolMessages` is exactly that island's catalogue type. */
export function loadLocalizedToolPage<T extends ToolMessageSlug>(toolSlug: T, localeId: string, routePrefix: string): Promise<LocalizedToolPageFor<ToolMessagesFor<T>>>;
export function loadLocalizedToolPage(toolSlug: string, localeId: string, routePrefix: string): Promise<LocalizedToolPageFor<unknown>>;
export function loadLocalizedToolPage(toolSlug: string, localeId: string, routePrefix: string) {
  return loadLocalizedToolPageImpl(toolSlug, localeId, routePrefix);
}

type LocalizedToolPageBase = Omit<Awaited<ReturnType<typeof loadLocalizedToolPageImpl>>, 'toolMessages'>;
type LocalizedToolPageFor<M> = LocalizedToolPageBase & { toolMessages: M | undefined };
export type LocalizedToolPage = LocalizedToolPageFor<unknown>;
