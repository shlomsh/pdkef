// The schema for the standalone SEO landing pages (long-tail pages and the OS
// how-to guides). One YAML entry per page in src/content/content-pages/, one
// dynamic route rendering all of them (src/pages/[contentPage].astro).
//
// WHY THIS EXISTS, AND WHAT IT IS FOR
//
// These eight pages were eight near-identical .astro files: the same card
// shells, the same step list, the same FAQ plumbing, differing only in copy.
// Duplicated structure is the cheap complaint about that; the expensive one is
// that nothing checked the copy. A page shipped with a FAQ entry missing its
// answer, a heading missing, or a link written without its trailing slash was a
// perfectly valid .astro file. scripts/verify-seo.js caught a subset of that
// after the fact, from the BUILT html, which means after a bad build already
// existed. Everything below is checked before a page renders at all, and the
// error names the file and the field.
//
// So the bounds here are not decoration. Each one is either an SEO fact (what
// Google will actually display), a design fact (what the template can render),
// or a house rule from CLAUDE.md that used to live only in prose. Where a bound
// is a judgement call it carries headroom over today's longest value and says
// so, because a guard that fights ordinary copy edits gets deleted.
//
// EDITING COPY: everything a page says lives in its own YAML file. Nothing in
// this file needs touching to reword a page - only to add a new KIND of thing
// to say. Prose fields take two tags, `<strong>` and `<a href="...">`; see
// src/lib/contentMarkup.ts for exactly what is allowed and why.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
// Not `astro:content`'s re-export of `z`: that one is deprecated and slated for
// removal, and `astro check` flags every use of it.
import { z } from 'astro/zod';
import { CONTENT_ICON_NAMES } from './data/contentIcons';
import { DOCUMENTATION_LOCALE_IDS } from './i18n/documentationLocales';
import { inlineHtmlProblems, plainTextProblems } from './lib/contentMarkup';

/** Text rendered through an expression: escaped, so no markup. */
const plain = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .superRefine((value, ctx) => {
      for (const message of plainTextProblems(value)) {
        ctx.addIssue({ code: 'custom', message });
      }
    });

/** Body copy: `<strong>` and `<a href="...">`, nothing else. */
const inline = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .superRefine((value, ctx) => {
      for (const message of inlineHtmlProblems(value)) {
        ctx.addIssue({ code: 'custom', message });
      }
    });

// Astro's directory build format plus vercel.json's trailingSlash:true make the
// slashed form the only canonical one. See CLAUDE.md, "URL canonicalization".
const sitePath = z
  .string()
  .regex(
    /^\/(?:[a-z]{2,3}(?:-[A-Za-z0-9]+)?\/)?[a-z0-9]+(?:-[a-z0-9]+)*\/$/,
    'must be a root or locale-prefixed lower-case site path with a trailing slash, e.g. "/sign/" or "/he/sign/"',
  );

const icon = z.enum(CONTENT_ICON_NAMES);

// CardDecor's own vocabulary. Duplicated from its Props on purpose: an entry
// naming a sketch that component cannot draw should fail here, with the file
// name, rather than render an empty decoration nobody notices.
const sketch = z.enum(['arcs', 'waves', 'rings', 'grid']);
const iconPos = z.enum(['tr', 'tl', 'br', 'bl', 'cr', 'cl']);

/** A numbered list. `steps` is an <ol>, `checklist` a <ul>. */
const listBlock = (kind: 'steps' | 'checklist') =>
  z.strictObject({
    kind: z.literal(kind),
    // Two is the fewest that is a list rather than a sentence; above about
    // eight, a numbered list on a landing page has stopped being scannable.
    items: z.array(inline(20, 400)).min(2).max(8),
  });

const blocks = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('prose'), text: inline(80, 900) }),
  z.strictObject({
    kind: z.literal('image'),
    // Local, versioned assets only. Dimensions reserve space before lazy loading.
    src: z.string().regex(/^\/images\/[a-z0-9/-]+\.(?:webp|png|jpg|svg)$/),
    alt: plain(20, 240),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    caption: inline(20, 400),
  }),
  z.strictObject({
    kind: z.literal('table'),
    caption: plain(20, 200),
    headers: z.array(plain(2, 60)).min(2).max(4),
    rows: z.array(z.array(plain(1, 220)).min(2).max(4)).min(2).max(8),
  }).superRefine((table, ctx) => {
    table.rows.forEach((row, index) => {
      if (row.length !== table.headers.length) {
        ctx.addIssue({ code: 'custom', path: ['rows', index], message: 'must have one cell per column header' });
      }
    });
  }),
  listBlock('steps'),
  listBlock('checklist'),
  z.strictObject({
    kind: z.literal('compare'),
    /** The device's own tool, e.g. "Preview" or "Microsoft Edge". */
    builtInLabel: plain(2, 40),
    caption: plain(20, 200).optional(),
    rows: z
      .array(
        z.strictObject({
          task: plain(10, 80),
          /** '' is the "no" row: CompareTable renders it as a dash. */
          builtIn: plain(0, 80),
          here: plain(2, 80),
        }),
      )
      .min(3)
      .max(10),
  }),
  z.strictObject({
    kind: z.literal('columns'),
    // Exactly three, because the template's grid is `grid-cols-3`. A fourth
    // item would silently wrap onto a second row on its own.
    items: z
      .array(
        z.strictObject({
          icon,
          title: inline(2, 40),
          body: inline(40, 400),
        }),
      )
      .length(3),
  }),
]);

const section = z.strictObject({
  variant: z.enum(['default', 'highlight']).default('default'),
  sketch,
  icon,
  iconPos,
  /** The small uppercase line above the heading. */
  kicker: inline(5, 60),
  heading: inline(10, 90),
  blocks: z.array(blocks).min(1).max(6),
});

const contentPageFields = z.strictObject({
  // Google shows roughly 60 characters. The cap is 65 so a title that has
  // grown past what will ever be displayed gets questioned, not blocked at
  // the exact boundary. Longest today: 60.
  title: plain(20, 65).refine(
    (value) => value.endsWith(' | PDkef'),
    'must end with " | PDkef", the site-wide title suffix',
  ),
  // Google truncates around 160; these run longer on purpose so the tail
  // still says something useful in an AI summary. Longest today: 175.
  description: plain(120, 200),
  /** The AppBar's second crumb, so: short. */
  breadcrumb: plain(3, 24),
  icon,
  kicker: plain(5, 40),
  h1: plain(15, 70),
  subhead: plain(80, 400),
  primaryCta: z.strictObject({ href: sitePath, label: plain(5, 40) }),
  sections: z.array(section).min(2).max(8),
  faq: z.array(z.strictObject({ question: plain(15, 120), answer: plain(40, 600) })).min(4).max(12),
});

const contentPages = defineCollection({
  loader: glob({
    pattern: '*.yaml',
    base: './src/content/content-pages',
    // The id IS the URL, and these URLs rank. The default generator slugifies,
    // which is a silent rewrite waiting to happen the first time a file is
    // named with a capital or an underscore; here a filename that is not
    // already the slug is a build error instead (see the route's cross-check).
    generateId: ({ entry }) => entry.replace(/\.yaml$/, ''),
  }),
  schema: contentPageFields,
});

const localizedPages = defineCollection({
  loader: glob({
    pattern: '**/*.yaml',
    base: './src/content/localized-pages',
    generateId: ({ entry }) => entry.replace(/\.yaml$/, ''),
  }),
  // Translations are not English word-count exercises. The structural and
  // markup validators stay identical, while the few language-sensitive prose
  // floors below allow concise languages to say the same thing honestly.
  schema: z.strictObject({
    ...contentPageFields.shape,
    description: plain(40, 200),
    subhead: plain(40, 400),
    faq: z.array(z.strictObject({ question: plain(10, 120), answer: plain(25, 600) })).min(4).max(12),
  })
    .extend({
      pageId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      locale: z.enum(DOCUMENTATION_LOCALE_IDS).refine((locale) => locale !== 'en', 'English stays in content-pages'),
      status: z.enum(['draft', 'published']),
      sourceVersion: z.string().min(1).max(120),
      reviewer: plain(3, 120).optional(),
      reviewedAt: z.string().date().optional(),
      reviewNotes: plain(20, 600).optional(),
    })
    .superRefine((entry, ctx) => {
      if (entry.status !== 'published') return;
      for (const field of ['reviewer', 'reviewedAt', 'reviewNotes'] as const) {
        if (!entry[field]) {
          ctx.addIssue({ code: 'custom', path: [field], message: `is required when status is published` });
        }
      }
    }),
});

export const collections = { contentPages, localizedPages };
