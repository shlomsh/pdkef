/**
 * Slug -> messages for the localized tool pages (localizedToolPage.ts). Each tool owns its text
 * in src/tools/<tool>/messages.ts; this is the one place the site picks among them, so editing
 * Merge's strings reaches Merge and the pages that render it, and nothing else.
 *
 * Adding a locale to a tool's messages.ts does not publish anything by itself: content.config.ts's
 * reviewer/sourceHash gate on the localizedTools entry is the publication gate. A published page
 * whose locale has no table here is a build error (loadLocalizedToolPage), not a silent English
 * fallback.
 */
import type { DocumentationLocaleId } from '../i18n/documentationLocales';
import { getMergeMessages } from '../tools/merge/messages';
import { getCompressMessages } from '../tools/compress/messages';
import { getSplitMessages } from '../tools/split/messages';
import { getToImageMessages } from '../tools/to-image/messages';
import { getImageToPdfMessages } from '../tools/image-to-pdf/messages';
import { getSignMessages } from '../tools/sign/messages';

const getters = {
  merge: getMergeMessages,
  compress: getCompressMessages,
  split: getSplitMessages,
  'pdf-to-image': getToImageMessages,
  'image-to-pdf': getImageToPdfMessages,
  sign: getSignMessages,
} as const;

/** The slugs that have a message catalogue. */
export type ToolMessageSlug = keyof typeof getters;

/** The catalogue type a tool's island takes as its `messages` prop. */
export type ToolMessagesFor<T extends ToolMessageSlug> = ReturnType<(typeof getters)[T]>;

/** The tool's catalogue for a locale, or undefined when the tool has none for it (every get<Tool>Messages falls back to English, so a non-English locale that resolves to the English table has no catalogue of its own). */
export function getToolMessages<T extends ToolMessageSlug>(toolSlug: T, locale: DocumentationLocaleId): ToolMessagesFor<T> | undefined;
export function getToolMessages(toolSlug: string, locale: DocumentationLocaleId): unknown | undefined;
export function getToolMessages(toolSlug: string, locale: DocumentationLocaleId): unknown | undefined {
  const get = (getters as Record<string, (locale: DocumentationLocaleId) => unknown>)[toolSlug];
  if (!get) return undefined;
  const messages = get(locale);
  return locale !== 'en' && messages === get('en') ? undefined : messages;
}
