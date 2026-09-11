import { describe, expect, it } from 'vitest';
import { mergeLocalizedTool, normalizeToolSource, toolSourceHash } from './localizedTools';

describe('normalizeToolSource / toolSourceHash', () => {
  const tool = {
    slug: 'merge',
    icon: 'Merge',
    href: '/merge/',
    seoTitle: 'Merge PDF | PDkef',
    seoDescription: 'Merge PDF files online for free.',
    schemaName: 'PDkef - Merge PDF',
    toolName: 'Merge PDF',
    h1: 'Merge PDF',
    subhead: 'Combine files.',
    ariaLabel: 'PDF merge tool',
    aboutHeading: 'How to merge',
    aboutLead: 'Combine PDFs.',
    freeNoteLead: 'Free forever.',
    steps: [{ title: 'Add', text: 'Add your files.' }],
    faq: [{ question: 'Is it free?', answer: 'Yes.' }],
  };

  it('only hashes the fields a crawler reads, not icon/slug/href', () => {
    const withDifferentIcon = { ...tool, icon: 'Something else entirely', slug: 'renamed', href: '/renamed/' };
    expect(toolSourceHash(tool)).toBe(toolSourceHash(withDifferentIcon));
  });

  it('changes when a translated field changes', () => {
    expect(toolSourceHash(tool)).not.toBe(toolSourceHash({ ...tool, h1: 'Different H1' }));
  });

  it('normalizes to exactly the crawlable fields', () => {
    expect(Object.keys(normalizeToolSource(tool)).sort()).toEqual([
      'aboutHeading',
      'aboutLead',
      'ariaLabel',
      'faq',
      'freeNoteLead',
      'h1',
      'schemaName',
      'seoDescription',
      'seoTitle',
      'steps',
      'subhead',
      'toolName',
    ]);
  });
});

describe('mergeLocalizedTool', () => {
  const englishTool = {
    slug: 'merge',
    icon: 'Merge',
    href: '/merge/',
    condenseOnLoad: true,
    seoTitle: 'Merge PDF | PDkef',
    h1: 'Merge PDF',
    faq: [{ question: 'Is it free?', answer: 'Yes.' }],
  };

  it('overlays only the translated text fields, keeping icon/slug/href/behavior from English', () => {
    const merged = mergeLocalizedTool(englishTool, {
      toolSlug: 'merge',
      locale: 'he',
      h1: 'מיזוג PDF',
      faq: [{ question: '?', answer: '.' }],
    });
    expect(merged).toMatchObject({
      slug: 'merge',
      icon: 'Merge',
      href: '/merge/',
      condenseOnLoad: true,
      seoTitle: 'Merge PDF | PDkef',
      h1: 'מיזוג PDF',
      faq: [{ question: '?', answer: '.' }],
    });
  });
});
