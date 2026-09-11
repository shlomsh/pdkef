// Renders the site's crawlable content as plain Markdown, for the .md
// endpoints in src/pages (see [slug].md.ts, 404.md.ts) and, at request time,
// for the Accept: text/markdown negotiation in middleware.ts.
//
// Deliberately NOT an HTML-to-Markdown converter run against the built
// dist/*.html: tool pages and content pages keep their real crawlable copy
// (headings, steps, FAQ) in structured data (src/data/tools.js, the
// contentPages collection) rather than as one blob of markup, and that
// structured data is already the single source of truth SeoSchema.astro's
// FAQ JSON-LD is built from - reading it a second time here keeps the
// Markdown, the HTML and the JSON-LD from ever disagreeing, and is more
// robust than scraping rendered HTML (which mixes in nav/app-bar/footer
// chrome and the tool pages' interactive island, which renders nothing
// static to scrape - see ToolPageLayout.astro's <main>, which wraps only
// the island, not the SEO copy that sits beside it).
const SITE = 'https://pdkef.com';

/**
 * Converts this codebase's inline-HTML dialects to Markdown. Handles both
 * the strict two-tag dialect content-pages validates (src/lib/contentMarkup.ts:
 * bare `<strong>`/`<a href="...">`) and tools.js's freeform class-bearing
 * markup (e.g. `<a class="..." href="...">`), then strips anything left over
 * defensively so a future tag never leaks into the Markdown as literal HTML.
 */
export function inlineToMarkdown(html) {
  if (!html) return '';
  const withoutTags = String(html)
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/g, '*$1*')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(withoutTags).trim();
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function absoluteUrl(href) {
  return href.startsWith('http') ? href : `${SITE}${href}`;
}

function faqSection(faq) {
  if (!faq || faq.length === 0) return '';
  const items = faq
    .map(({ question, answer }) => `### ${inlineToMarkdown(question)}\n\n${inlineToMarkdown(answer)}`)
    .join('\n\n');
  return `## FAQ\n\n${items}\n`;
}

/** A src/data/tools.js entry -> Markdown. */
export function toolToMarkdown(tool) {
  const parts = [`# ${tool.h1}`, '', inlineToMarkdown(tool.subhead), '', `URL: ${absoluteUrl(tool.href)}`];

  if (tool.steps?.length) {
    parts.push('', `## ${tool.aboutHeading ?? 'How it works'}`, '');
    if (tool.aboutLead) parts.push(inlineToMarkdown(tool.aboutLead), '');
    parts.push(...tool.steps.map((step, i) => `${i + 1}. **${inlineToMarkdown(step.title)}** - ${inlineToMarkdown(step.text)}`));
  }

  if (tool.faq?.length) {
    parts.push('', faqSection(tool.faq));
  }

  return `${parts.join('\n').trimEnd()}\n`;
}

function blockToMarkdown(block) {
  switch (block.kind) {
    case 'prose':
      return inlineToMarkdown(block.text);
    case 'image':
      return `![${block.alt}](${absoluteUrl(block.src)})\n\n*${inlineToMarkdown(block.caption)}*`;
    case 'table': {
      const header = `| ${block.headers.join(' | ')} |`;
      const divider = `| ${block.headers.map(() => '---').join(' | ')} |`;
      const rows = block.rows.map((row) => `| ${row.join(' | ')} |`);
      return [block.caption, '', header, divider, ...rows].join('\n');
    }
    case 'steps':
      return block.items.map((item, i) => `${i + 1}. ${inlineToMarkdown(item)}`).join('\n');
    case 'checklist':
      return block.items.map((item) => `- ${inlineToMarkdown(item)}`).join('\n');
    case 'compare': {
      const header = `| Task | ${block.builtInLabel} | PDkef |`;
      const divider = '| --- | --- | --- |';
      const rows = block.rows.map((row) => `| ${row.task} | ${row.builtIn || '-'} | ${row.here} |`);
      return [block.caption, '', header, divider, ...rows].filter(Boolean).join('\n');
    }
    case 'columns':
      return block.items.map((item) => `- **${inlineToMarkdown(item.title)}**: ${inlineToMarkdown(item.body)}`).join('\n');
    default:
      return '';
  }
}

/** A contentPages collection entry's `.data` (plus its id/slug) -> Markdown.
 * `lastModified` is the same git-derived ISO timestamp the HTML page shows as
 * "Last updated" (SEO-29); it is optional only so the pure renderer stays
 * testable without git. */
export function contentPageToMarkdown(slug, page, { lastModified } = {}) {
  const parts = [`# ${page.h1}`, '', inlineToMarkdown(page.subhead), '', `URL: ${absoluteUrl(`/${slug}/`)}`];
  if (lastModified) parts.push(`Last updated: ${lastModified.slice(0, 10)}`);

  for (const section of page.sections) {
    parts.push('', `## ${inlineToMarkdown(section.heading)}`, '');
    parts.push(section.blocks.map(blockToMarkdown).filter(Boolean).join('\n\n'));
  }

  if (page.primaryCta) {
    parts.push('', `[${page.primaryCta.label}](${absoluteUrl(page.primaryCta.href)})`);
  }

  if (page.faq?.length) {
    parts.push('', faqSection(page.faq));
  }

  return `${parts.join('\n').trimEnd()}\n`;
}

/** A src/data/staticPages.js entry -> Markdown. */
export function staticPageToMarkdown(page) {
  const parts = [`# ${page.h1}`, '', inlineToMarkdown(page.description), '', `URL: ${absoluteUrl(`/${page.slug}/`)}`];
  for (const section of page.sections) {
    parts.push('');
    if (section.heading) parts.push(`## ${section.heading}`, '');
    parts.push(section.paragraphs.map((p) => inlineToMarkdown(p)).join('\n\n'));
  }
  return `${parts.join('\n').trimEnd()}\n`;
}

/** The home page (src/pages/index.astro's own h1/description/faq) -> Markdown. */
export function homeToMarkdown({ h1, description, faq, tools }) {
  const parts = [
    `# ${h1}`,
    '',
    description,
    '',
    `URL: ${SITE}/`,
    '',
    '## Tools',
    '',
    ...tools.map((tool) => `- [${tool.toolName}](${absoluteUrl(tool.href)}): ${inlineToMarkdown(tool.gridDescription)}`),
  ];
  if (faq?.length) {
    parts.push('', faqSection(faq));
  }
  return `${parts.join('\n').trimEnd()}\n`;
}

export const MARKDOWN_404_BODY = `# Page not found

The path you requested does not exist on pdkef.com.

- Full list of pages: ${SITE}/sitemap.xml
- Machine-readable site overview: ${SITE}/llms.txt
- Home: ${SITE}/
`;
