import { describe, expect, it } from 'vitest';
import { isPublishedEditionLink, mergeLocalizedTool, normalizeToolSource, toolSourceHash } from './localizedTools';

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

// LOC-05: the decision ContentPageLayout's primaryCta now runs before showing
// its English-fallback "EN" mark - the same question ToolCrossLinks/
// RelatedGuides answer per card via `editionPaths`, asked once so a plain
// authored href (the content-pages YAML's primaryCta.href, not a pageId a
// card can re-derive a localized variant from) doesn't need its own copy of
// the logic.
describe('isPublishedEditionLink', () => {
  const heEditionPaths = ['/he/', '/he/sign/', '/he/install-pdf-app/'];

  it('flags a fallback: a Hebrew page whose CTA target has no Hebrew edition (the open-source guide -> /edit-pdf/)', () => {
    expect(isPublishedEditionLink('/edit-pdf/', 'he', heEditionPaths)).toBe(false);
  });

  it('does not flag a Hebrew page whose CTA target already has a Hebrew edition (-> /he/sign/)', () => {
    expect(isPublishedEditionLink('/he/sign/', 'he', heEditionPaths)).toBe(true);
  });

  it('never flags an English page, whatever the href', () => {
    expect(isPublishedEditionLink('/edit-pdf/', 'en', heEditionPaths)).toBe(true);
    expect(isPublishedEditionLink('/sign/', 'en', [])).toBe(true);
  });
});
