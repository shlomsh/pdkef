import { describe, expect, it } from 'vitest';
import { getToolCardCopy } from './cardMessages';
import { getDocumentationShellMessages } from './documentationMessages';
import { guideFaqHeading, toolFaqHeading } from './faqHeading';

const en = getDocumentationShellMessages('en');
const he = getDocumentationShellMessages('he');

describe('FAQ heading', () => {
  it('names the tool on a tool page', () => {
    expect(toolFaqHeading(en, 'en', 'merge')).toBe('Merge PDF questions');
  });

  it('uses the localized tool name', () => {
    expect(toolFaqHeading(he, 'he', 'merge')).toContain(getToolCardCopy('he', 'merge')!.title);
  });

  it('names the tool a guide hangs off', () => {
    expect(guideFaqHeading(en, 'en', 'pdf-wont-compress-to-100kb')).toBe('Compress PDF questions');
  });

  it('falls back to the general heading for a page with no tool', () => {
    expect(guideFaqHeading(en, 'en', 'no-such-guide')).toBe('Questions about these free PDF tools');
  });
});

describe('section headings', () => {
  it('say something instead of naming the section', () => {
    expect(en).toMatchObject({
      relatedHeading: 'Step-by-step guides for this tool',
      crossLinksHeading: 'More free PDF tools that run in your browser',
      freeForEveryone: 'Free, no signup, and your file never leaves your device',
    });
  });
});
