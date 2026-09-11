import { describe, it, expect } from 'vitest';
import {
  inlineToMarkdown,
  toolToMarkdown,
  contentPageToMarkdown,
  staticPageToMarkdown,
  homeToMarkdown,
  MARKDOWN_404_BODY,
} from './markdownRender.js';

describe('inlineToMarkdown', () => {
  it('converts the content-pages two-tag dialect', () => {
    expect(inlineToMarkdown('<strong>Open</strong> <a href="/sign/">the tool</a>.')).toBe(
      '**Open** [the tool](/sign/).',
    );
  });

  it('converts a bare strong/link pair', () => {
    expect(inlineToMarkdown('<strong>Bold</strong> text')).toBe('**Bold** text');
    expect(inlineToMarkdown('a <a href="https://example.com">link</a>')).toBe('a [link](https://example.com)');
  });

  it('handles tools.js-style class-bearing links', () => {
    expect(
      inlineToMarkdown('See <a class="font-medium text-[var(--color-primary-text)]" href="/sign/">sign a PDF</a>.'),
    ).toBe('See [sign a PDF](/sign/).');
  });

  it('handles external links with target/rel attributes', () => {
    expect(
      inlineToMarkdown('<a href="https://github.com/shlomsh/pdkef" target="_blank" rel="noopener noreferrer">source</a>'),
    ).toBe('[source](https://github.com/shlomsh/pdkef)');
  });

  it('strips any other tag defensively rather than leaking raw HTML', () => {
    expect(inlineToMarkdown('<span class="x">text</span>')).toBe('text');
  });

  it('decodes the entities the codebase uses', () => {
    expect(inlineToMarkdown('Terms &amp; conditions &lt;here&gt; &quot;quoted&quot; it&#39;s')).toBe(
      'Terms & conditions <here> "quoted" it\'s',
    );
  });

  it('returns an empty string for nullish input', () => {
    expect(inlineToMarkdown(undefined)).toBe('');
    expect(inlineToMarkdown('')).toBe('');
  });
});

describe('toolToMarkdown', () => {
  const tool = {
    h1: 'Sign PDF Free',
    subhead: 'Fill and sign without printing.',
    href: '/sign/',
    aboutHeading: 'How it works',
    aboutLead: 'Open a file, then sign it.',
    steps: [{ title: 'Open', text: 'Pick a file.' }],
    faq: [{ question: 'Is it free?', answer: 'Yes.' }],
  };

  it('renders an H1, the URL, numbered steps, and an FAQ section', () => {
    const md = toolToMarkdown(tool);
    expect(md).toContain('# Sign PDF Free');
    expect(md).toContain('URL: https://pdkef.com/sign/');
    expect(md).toContain('1. **Open** - Pick a file.');
    expect(md).toContain('## FAQ');
    expect(md).toContain('### Is it free?');
    expect(md).toContain('Yes.');
  });

  it('renders every real tool without throwing and always includes an H1 and FAQ', async () => {
    const { tools } = await import('../data/tools.js');
    for (const t of tools) {
      const md = toolToMarkdown(t);
      expect(md).toMatch(/^# /);
      expect(md).toContain('## FAQ');
      expect(md).not.toMatch(/<[a-z]/i);
    }
  });
});

describe('contentPageToMarkdown', () => {
  const page = {
    h1: 'A guide',
    subhead: 'Subhead text.',
    sections: [
      {
        heading: 'First section',
        blocks: [
          { kind: 'prose', text: '<strong>Bold</strong> prose.' },
          { kind: 'steps', items: ['Step one', 'Step two'] },
          { kind: 'checklist', items: ['Check one', 'Check two'] },
          {
            kind: 'table',
            caption: 'A table',
            headers: ['A', 'B'],
            rows: [['1', '2']],
          },
        ],
      },
    ],
    primaryCta: { href: '/sign/', label: 'Try it' },
    faq: [{ question: 'Q?', answer: 'A.' }],
  };

  it('renders headings, blocks by kind, the CTA link, and FAQ', () => {
    const md = contentPageToMarkdown('a-guide', page);
    expect(md).toContain('# A guide');
    expect(md).toContain('URL: https://pdkef.com/a-guide/');
    expect(md).toContain('## First section');
    expect(md).toContain('**Bold** prose.');
    expect(md).toContain('1. Step one');
    expect(md).toContain('- Check one');
    expect(md).toContain('| A | B |');
    expect(md).toContain('[Try it](https://pdkef.com/sign/)');
    expect(md).toContain('### Q?');
  });

  it('adds a calendar-date "Last updated" line only when a timestamp is supplied', () => {
    expect(contentPageToMarkdown('a-guide', page)).not.toContain('Last updated');
    const md = contentPageToMarkdown('a-guide', page, { lastModified: '2026-09-11T21:54:25.000Z' });
    expect(md).toContain('URL: https://pdkef.com/a-guide/\nLast updated: 2026-09-11');
  });

  // Every real content-pages entry is exercised by `npm run build` itself
  // (src/pages/[slug].md.ts calls contentPageToMarkdown for each collection
  // entry) rather than here: astro:content is deliberately unavailable under
  // Vitest (see src/test/astroContentStub.js) so unit tests pass in fixture
  // data instead of reaching into the content layer.
});

describe('staticPageToMarkdown', () => {
  it('separates the description, URL, and each section with blank lines', () => {
    const page = {
      slug: 'about',
      h1: 'About',
      description: 'Desc.',
      sections: [{ paragraphs: ['First.'] }, { heading: 'More', paragraphs: ['Second.'] }],
    };
    const md = staticPageToMarkdown(page);
    expect(md).toBe(
      ['# About', '', 'Desc.', '', 'URL: https://pdkef.com/about/', '', 'First.', '', '## More', '', 'Second.'].join(
        '\n',
      ) + '\n',
    );
  });

  it('renders every real static page (about/contact/privacy) without throwing', async () => {
    const { staticPages } = await import('../data/staticPages.js');
    expect(staticPages.length).toBeGreaterThanOrEqual(3);
    for (const page of staticPages) {
      const md = staticPageToMarkdown(page);
      expect(md).toMatch(/^# /);
      expect(md).not.toMatch(/<[a-z]/i);
    }
  });
});

describe('homeToMarkdown', () => {
  it('lists every tool as a link and includes the FAQ', () => {
    const md = homeToMarkdown({
      h1: 'Free PDF tools',
      description: 'Desc.',
      faq: [{ question: 'Q?', answer: 'A.' }],
      tools: [{ toolName: 'Sign', href: '/sign/', gridDescription: 'Sign it.' }],
    });
    expect(md).toContain('# Free PDF tools');
    expect(md).toContain('- [Sign](https://pdkef.com/sign/): Sign it.');
    expect(md).toContain('### Q?');
  });
});

describe('MARKDOWN_404_BODY', () => {
  it('points agents at the sitemap and llms.txt', () => {
    expect(MARKDOWN_404_BODY).toContain('# Page not found');
    expect(MARKDOWN_404_BODY).toContain('https://pdkef.com/sitemap.xml');
    expect(MARKDOWN_404_BODY).toContain('https://pdkef.com/llms.txt');
  });
});
