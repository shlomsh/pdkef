// The three tools a tool page shows as stickers under "More free PDF tools" (SITE-47): the next
// steps a person on that page is most likely to want, so the section reads as a suggestion and
// not as the whole catalogue. Every other tool still gets a plain link in the row under them.
//
// Picked by intent, weighted by use. Telemetry cannot rank pairs yet: on 2026-11-07 only
// hand-offs into Unlock carried their origin (21 in 60 days, nearly all Redact to Unlock), so
// the order follows each tool's own finish-state hand-offs (Compress and Merge offer Sign and
// Merge or Compress) and what the file is usually for next: sent through a size-capped portal,
// joined with others, or signed.
//
// Pure data and one pure lookup: ToolCrossLinks.astro renders it, relatedTools.test.js keeps
// every list valid against the registry.
import { tools } from './tools.js';

export const RELATED_COUNT = 3;

/** @type {Record<string, readonly string[]>} */
export const relatedTools = {
  sign: ['compress', 'merge', 'scan-to-pdf'],
  'highlight-pdf': ['scan-to-pdf', 'split', 'merge'],
  redact: ['unlock', 'compress', 'merge'],
  merge: ['compress', 'sign', 'organize-pdf'],
  'pdf-to-image': ['compress-image', 'split', 'compress'],
  'image-to-pdf': ['compress', 'merge', 'scan-to-pdf'],
  'scan-to-pdf': ['compress', 'sign', 'merge'],
  split: ['merge', 'organize-pdf', 'compress'],
  compress: ['compress-image', 'merge', 'sign'],
  'compress-image': ['compress', 'image-to-pdf', 'scan-to-pdf'],
  unlock: ['sign', 'merge', 'compress'],
  'organize-pdf': ['merge', 'split', 'compress'],
};

/** A page that is no tool (a guide) shows the three most used tools. */
export const DEFAULT_RELATED = ['redact', 'sign', 'merge'];

/** The sticker slugs for a page: a variant page (rotate, extract pages, ...) borrows its parent's. */
export function relatedFor(slug) {
  const tool = tools.find((t) => t.slug === slug);
  const key = tool && 'variantOf' in tool && tool.variantOf ? tool.variantOf : slug;
  return relatedTools[key] ?? DEFAULT_RELATED;
}
