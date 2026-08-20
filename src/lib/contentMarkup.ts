// The tiny inline-HTML dialect the content collection speaks, plus the design
// system classes it renders with.
//
// Why a dialect at all: a landing page's prose needs the odd link and the odd
// bold run mid-sentence, and there is no way to express that as plain data
// without either splitting every paragraph into fragments (unreadable to edit)
// or letting arbitrary HTML into the content files (unreviewable, and it would
// put presentation back in the data). So content authors write two tags and
// nothing else, and this module is what makes that safe:
//
//   - `inlineHtmlProblems()` is what src/content.config.ts validates with, so
//     an unsupported tag, an unbalanced one, a bare "&", or an internal link
//     missing its trailing slash is a BUILD ERROR naming the file, not
//     something that ships.
//   - `renderInline()` puts the classes back on. Authors never write a class
//     in a content file: the link and bold styling belongs to the design
//     system, so it lives here once rather than 40 times across eight pages.
//
// The trailing-slash rule is the same one CLAUDE.md's "URL canonicalization"
// section describes: `vercel.json` normalises `/x` to `/x/` before it matches
// anything, so a link written without the slash costs a redirect hop on every
// crawl. It was previously prose in a doc; here it is enforced.

/** Every `<a>` in body copy. */
export const INLINE_LINK_CLASS =
  'text-[var(--color-primary)] underline underline-offset-2 hover:text-[var(--color-primary-hover)]';

/**
 * `<strong>` has two forms, and the difference is not decorative: inside a
 * muted block (the three-column cards, which are `text-[var(--color-muted)]`)
 * a bold run has to reassert the full-strength ink or it reads as no emphasis
 * at all. Callers pass the tone of the block they are rendering into.
 */
export const STRONG_CLASS = {
  body: 'font-semibold',
  muted: 'font-semibold text-[var(--color-text)]',
} as const;

export type InlineTone = keyof typeof STRONG_CLASS;

const TAG = /<[^>]*>/g;
const OPEN_LINK = /^<a href="([^"]+)"( target="_blank" rel="noopener noreferrer")?>$/;
const CLOSE = /^<\/([a-zA-Z][a-zA-Z0-9]*)>$/;
// The entities the copy actually needs. Anything else is far likelier to be a
// stray "&" than a deliberate reference, and a stray one is invalid markup.
const ENTITY = /&(?:amp|lt|gt|quot|#39);/;
const BARE_AMPERSAND = /&(?!(?:amp|lt|gt|quot|#39);)/g;

function near(value: string, index: number): string {
  return JSON.stringify(value.slice(Math.max(0, index - 30), index + 40));
}

function hrefProblems(href: string, hasNewTabAttrs: boolean): string[] {
  if (href.startsWith('/')) {
    if (hasNewTabAttrs) return [`internal link "${href}" should not open in a new tab`];
    return href.endsWith('/')
      ? []
      : [`internal link "${href}" must end in a slash, or it costs a redirect hop on every crawl`];
  }
  if (href.startsWith('https://')) {
    return hasNewTabAttrs
      ? []
      : [`external link "${href}" must carry target="_blank" rel="noopener noreferrer"`];
  }
  return [`link "${href}" must be an absolute site path ("/sign/") or an https:// URL`];
}

/**
 * Everything wrong with an inline-HTML string, as human-readable lines. Empty
 * array means it is renderable.
 */
export function inlineHtmlProblems(value: string): string[] {
  const problems: string[] = [];

  for (const match of value.matchAll(BARE_AMPERSAND)) {
    problems.push(`bare "&" - write "&amp;" - near ${near(value, match.index)}`);
  }

  const stack: string[] = [];
  let tags = 0;
  for (const match of value.matchAll(TAG)) {
    const tag = match[0];
    tags += 1;

    const close = CLOSE.exec(tag);
    if (close) {
      if (stack.pop() !== close[1]) problems.push(`unbalanced ${tag}`);
      continue;
    }
    if (tag === '<strong>') {
      if (stack.includes('strong')) problems.push('nested <strong>');
      stack.push('strong');
      continue;
    }
    const link = OPEN_LINK.exec(tag);
    if (link) {
      if (stack.includes('a')) problems.push('nested <a>');
      stack.push('a');
      problems.push(...hrefProblems(link[1], Boolean(link[2])));
      continue;
    }
    problems.push(
      `unsupported markup ${tag} - body copy may only use <strong> and ` +
        `<a href="..."> (external links add target="_blank" rel="noopener noreferrer")`,
    );
  }

  const angles = (value.match(/</g) ?? []).length;
  if (angles !== tags) problems.push('a "<" that does not open a tag - write "&lt;"');
  for (const open of stack) problems.push(`unclosed <${open}>`);

  return problems;
}

/** Text rendered as-is through an expression, so it must not contain markup. */
export function plainTextProblems(value: string): string[] {
  const problems: string[] = [];
  if (value.includes('<')) {
    problems.push('this field is plain text and escapes markup - "<" would render literally');
  }
  if (ENTITY.test(value)) {
    problems.push('this field is plain text - an HTML entity here renders as its own source');
  }
  return problems;
}

/** Inline HTML with the design system's classes applied. */
export function renderInline(value: string, tone: InlineTone = 'body'): string {
  const problems = inlineHtmlProblems(value);
  if (problems.length > 0) {
    throw new Error(`Unrenderable inline HTML: ${problems.join('; ')}`);
  }
  return value
    .replaceAll('<a href=', `<a class="${INLINE_LINK_CLASS}" href=`)
    .replaceAll('<strong>', `<strong class="${STRONG_CLASS[tone]}">`);
}
