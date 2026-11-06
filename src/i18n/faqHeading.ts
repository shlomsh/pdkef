// The FAQ section's heading: it names the tool a page is about, so the heading
// carries a search phrase, and says something general where there is no tool.
import { contentPages } from '../data/contentPages.js';
import { toolsBySlug } from '../data/tools.js';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { getToolCardCopy } from './cardMessages';
import type { DocumentationShellMessages } from './documentationMessages';

type FaqMessages = Pick<DocumentationShellMessages, 'faqHeading' | 'toolFaqHeading'>;

export function toolFaqHeading(messages: FaqMessages, locale: string, slug: string): string {
  const tool = getToolCardCopy(locale, slug)?.title ?? (toolsBySlug as Record<string, { gridTitle: string }>)[slug].gridTitle;
  return formatMessage(messages.toolFaqHeading, { tool });
}

export function guideFaqHeading(messages: FaqMessages, locale: string, pageId: string): string {
  const hub = contentPages.find((page) => page.href === `/${pageId}/`)?.hub;
  return hub ? toolFaqHeading(messages, locale, hub) : messages.faqHeading;
}
