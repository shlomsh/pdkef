import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  CONTENT_FLOW_CLASS,
  CONTENT_PARAGRAPH_CLASS,
  STEP_LIST_CLASS,
  INLINE_LINK_CLASS,
  STRONG_CLASS,
  inlineHtmlProblems,
  plainTextProblems,
  renderInline,
} from './contentMarkup.ts';

// These are the checks standing between a content-collection entry and the
// built page, so each case below is a thing that used to be able to ship.

describe('inlineHtmlProblems', () => {
  it('accepts the two tags body copy is allowed', () => {
    expect(
      inlineHtmlProblems('<strong>Open <a href="/sign/">the tool</a></strong> and pick a file.'),
    ).toEqual([]);
  });

  it('accepts an external link carrying its new-tab attributes', () => {
    expect(
      inlineHtmlProblems(
        '<a href="https://github.com/shlomsh/pdkef" target="_blank" rel="noopener noreferrer">source</a>',
      ),
    ).toEqual([]);
  });

  it('rejects an internal link without its trailing slash', () => {
    // vercel.json normalises /sign to /sign/ before matching anything, so the
    // slash-less form costs a redirect hop on every crawl.
    expect(inlineHtmlProblems('see <a href="/sign">the tool</a>')).toEqual([
      expect.stringContaining('must end in a slash'),
    ]);
  });

  it('rejects an external link that would leak the opener', () => {
    expect(inlineHtmlProblems('<a href="https://example.com/">x</a>')).toEqual([
      expect.stringContaining('target="_blank" rel="noopener noreferrer"'),
    ]);
  });

  it('rejects a relative or protocol-less link', () => {
    expect(inlineHtmlProblems('<a href="sign/">x</a>')).toEqual([
      expect.stringContaining('absolute site path'),
    ]);
  });

  it('rejects markup outside the dialect', () => {
    expect(inlineHtmlProblems('a <em>word</em>')).toEqual([
      expect.stringContaining('unsupported markup <em>'),
      expect.stringContaining('unbalanced </em>'),
    ]);
  });

  it('rejects an author-supplied class, because the design system owns styling', () => {
    expect(inlineHtmlProblems('<a class="text-red-500" href="/sign/">x</a>')).toContainEqual(
      expect.stringContaining('unsupported markup'),
    );
  });

  it('rejects unclosed and unbalanced tags', () => {
    expect(inlineHtmlProblems('<strong>bold')).toEqual(['unclosed <strong>']);
    expect(inlineHtmlProblems('<strong>bold</a>')).toContainEqual('unbalanced </a>');
  });

  it('rejects a bare ampersand but allows a real entity', () => {
    expect(inlineHtmlProblems('Sign &amp; Fill')).toEqual([]);
    expect(inlineHtmlProblems('Sign & Fill')).toEqual([expect.stringContaining('bare "&"')]);
  });

  it('rejects a "<" that opens nothing', () => {
    expect(inlineHtmlProblems('3 < 4')).toEqual([expect.stringContaining('does not open a tag')]);
  });
});

describe('plainTextProblems', () => {
  it('accepts ordinary prose, quotes and apostrophes included', () => {
    expect(plainTextProblems(`Two things are called "signing a PDF", and it's worth saying.`)).toEqual(
      [],
    );
  });

  it('rejects markup, which would render as its own source', () => {
    expect(plainTextProblems('a <strong>bold</strong> claim')).toHaveLength(1);
    expect(plainTextProblems('Sign &amp; Fill')).toEqual([
      expect.stringContaining('renders as its own source'),
    ]);
  });
});

describe('renderInline', () => {
  it('applies the link and bold classes so content files never carry one', () => {
    expect(renderInline('<strong>Open <a href="/sign/">it</a></strong>')).toBe(
      `<strong class="${STRONG_CLASS.body}">Open <a class="${INLINE_LINK_CLASS}" href="/sign/">it</a></strong>`,
    );
  });

  it('uses the stronger ink for bold inside a muted block', () => {
    // A muted column body is var(--color-muted); bold has to climb back to
    // var(--color-text) there or it reads as no emphasis at all.
    expect(renderInline('<strong>Use it for</strong> scans', 'muted')).toBe(
      `<strong class="${STRONG_CLASS.muted}">Use it for</strong> scans`,
    );
  });

  it("emits a bare <strong> for the 'inherit' tone, never class=\"\"", () => {
    // LOC-09: this tone exists so a string moving out of hardcoded template
    // markup and into a content object renders byte-for-byte as it did. The
    // home page's draft-persistence line is the caller; it inherits the muted
    // paragraph's color and the browser's default weight, and emitting an
    // empty class attribute would already be a diff against that.
    const rendered = renderInline('Available in <strong>Sign &amp; Fill</strong>.', 'inherit');
    expect(rendered).toBe('Available in <strong>Sign &amp; Fill</strong>.');
    expect(rendered).not.toContain('class');
  });

  it('still classes links under the inherit tone - only <strong> is left bare', () => {
    expect(renderInline('<a href="/sign/">Sign</a>', 'inherit')).toBe(
      `<a class="${INLINE_LINK_CLASS}" href="/sign/">Sign</a>`,
    );
  });

  it('leaves entities alone', () => {
    expect(renderInline('Sign &amp; Fill')).toBe('Sign &amp; Fill');
  });

  it('throws rather than rendering markup that never passed the schema', () => {
    expect(() => renderInline('<script>alert(1)</script>')).toThrow(/Unrenderable inline HTML/);
  });
});

// Shlomi, 2026-10-22: the tool pages' "How it works" card and the guides'
// cards are one design. Its paragraphs ran 68ch, its free note 64ch and its
// steps the full card width, in two text colors. A shared 68ch measure fixed
// the mismatch but not the asymmetry: the text stopped short of the edge the
// headings, the divider and the guides' tables run to. Every block now fills
// the card, so both margins are the card's own padding.
describe('content block classes', () => {
  const BLOCKS = { CONTENT_PARAGRAPH_CLASS, STEP_LIST_CLASS };

  it('lets every block fill the card, like its headings', () => {
    for (const [name, value] of Object.entries(BLOCKS)) expect(value, name).not.toMatch(/max-w-/);
  });

  // The browser's default paragraph margin stacked on space-content-row: 44px
  // after a paragraph against 29px between steps (Shlomi, same day).
  it('leaves the gap after a paragraph to the rhythm classes alone', () => {
    expect(CONTENT_PARAGRAPH_CLASS.split(' ')).toContain('m-0');
  });

  it('sets every block in the same font', () => {
    for (const [name, value] of Object.entries(BLOCKS)) expect(value.split(' '), name).toContain('type-lead');
  });

  // The whole-site audit (same day) found each block type bringing its own
  // trailing gap: paragraphs 29-32px of padding, ContentTable and figures a
  // 24px margin, CompareTable none, and step lists none at all (their p-0
  // outranked the padding), so step 3 on /open-source-pdf-editor/ ran into
  // the paragraph after it. One flow container owns the gap between blocks.
  it('spaces blocks with one flow gap', () => {
    expect(CONTENT_FLOW_CLASS).toContain('gap-[var(--space-content-row)]');
  });

  it.each(['src/components/ContentPage.astro', 'src/components/ToolAboutCard.astro'])(
    '%s takes its block classes from here and leaves the gaps to the flow',
    (file) => {
      const source = readFileSync(file, 'utf8');
      for (const name of ['CONTENT_FLOW_CLASS', 'CONTENT_PARAGRAPH_CLASS', 'STEP_LIST_CLASS']) expect(source).toMatch(name);
      expect(source).not.toMatch(/max-w-\[\d+ch\]/);
      expect(source).not.toMatch(/list-decimal/);
      expect(source).not.toMatch(/space-content-row/);
    },
  );

  it.each(['src/components/ContentImage.astro', 'src/components/ContentTable.astro', 'src/components/compareFigure.css'])(
    '%s brings no trailing margin of its own',
    (file) => {
      expect(readFileSync(file, 'utf8')).not.toMatch(/margin(-bottom)?: *(0 0 )?1\.5rem/);
    },
  );
});
