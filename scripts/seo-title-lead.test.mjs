import { describe, it, expect } from 'vitest';
import {
  leadingPhrase,
  classifyChange,
  classifyPage,
  titlesFromToolsSource,
  titlesFromYaml,
} from './seo-title-lead.mjs';

// The SEO-45 case: /merge/'s title lead was rewritten on 2026-09-12 and the page fell from
// page one; /compress/ got a new tail only and held.
const MERGE_OLD = 'Merge PDF Online Free - Combine PDFs in Your Browser';
const MERGE_NEW = 'Merge or Combine PDF Files Online Free - No Upload';
const COMPRESS_OLD = 'Compress PDF to 100KB Free - Reduce File Size';
const COMPRESS_NEW = 'Compress PDF to 100KB Free - No Upload, Reduce Size';

describe('leadingPhrase', () => {
  it('takes the text before the first " - ", ":" or "|"', () => {
    expect(leadingPhrase(MERGE_OLD)).toBe('merge pdf online free');
    expect(leadingPhrase('Sign PDF Online Free: Fill & Sign Forms')).toBe('sign pdf online free');
    expect(leadingPhrase('Edit PDF | PDkef')).toBe('edit pdf');
  });

  it('uses whichever separator comes first', () => {
    expect(leadingPhrase('A: b - c | d')).toBe('a');
    expect(leadingPhrase('A - b: c')).toBe('a');
  });

  it('is case-insensitive and ignores spacing', () => {
    expect(leadingPhrase('  MERGE   pdf Online FREE - x')).toBe('merge pdf online free');
  });

  it('keeps a hyphen inside a word and treats a title with no separator as all lead', () => {
    expect(leadingPhrase('Split PDF by Page-Range')).toBe('split pdf by page-range');
  });
});

describe('classifyChange', () => {
  it('flags the SEO-45 /merge/ rewrite as LEAD CHANGED', () => {
    expect(classifyChange(MERGE_OLD, MERGE_NEW)).toBe('LEAD CHANGED');
  });

  it('calls the /compress/ rewrite a tail change', () => {
    expect(classifyChange(COMPRESS_OLD, COMPRESS_NEW)).toBe('tail changed');
  });

  it('calls an identical or case-only difference unchanged', () => {
    expect(classifyChange(MERGE_OLD, MERGE_OLD)).toBe('unchanged');
    expect(classifyChange('Merge PDF Online Free - x', 'merge pdf online free - x')).toBe('unchanged');
  });

  it('reports nothing when either side is missing', () => {
    expect(classifyChange(undefined, MERGE_NEW)).toBe('no history');
  });
});

describe('classifyPage', () => {
  const before = { seoTitle: COMPRESS_OLD, h1: 'Compress PDF to 100KB Free: Reduce File Size' };

  it('takes the worst of title and h1', () => {
    const after = { seoTitle: COMPRESS_NEW, h1: 'Shrink PDF to 100KB Free: Reduce File Size' };
    expect(classifyPage(before, after).state).toBe('LEAD CHANGED');
    expect(classifyPage(before, after).h1).toBe('LEAD CHANGED');
    expect(classifyPage(before, after).seoTitle).toBe('tail changed');
  });

  it('is tail changed when only tails moved', () => {
    const after = { seoTitle: COMPRESS_NEW, h1: before.h1 };
    expect(classifyPage(before, after).state).toBe('tail changed');
  });

  it('is no history without a before', () => {
    expect(classifyPage(null, before).state).toBe('no history');
  });
});

describe('titlesFromToolsSource', () => {
  const src = [
    'export const tools = [',
    '  {',
    "    slug: 'merge',",
    "    href: '/merge/',",
    "    seoTitle: 'Merge or Combine PDF Files Online Free - No Upload | PDkef',",
    "    seoDescription:",
    "      'Not this.',",
    "    h1: 'Merge or Combine PDF Files Online Free',",
    '  },',
    '  {',
    "    href: '/split/',",
    "    seoTitle: 'Split PDF Online Free - Extract Pages, No Upload | PDkef',",
    "    h1: 'Split PDF Online Free: Extract Pages',",
    '  },',
    '];',
  ].join('\n');

  it('maps each href to its seoTitle and h1', () => {
    const map = titlesFromToolsSource(src);
    expect(map['/merge/']).toEqual({
      seoTitle: 'Merge or Combine PDF Files Online Free - No Upload | PDkef',
      h1: 'Merge or Combine PDF Files Online Free',
    });
    expect(map['/split/'].h1).toBe('Split PDF Online Free: Extract Pages');
  });
});

describe('titlesFromYaml', () => {
  it('reads seoTitle and h1 from a localized tool file', () => {
    const yaml = "reviewNotes: >-\n  text\nseoTitle: 'איחוד קבצי PDF - בדפדפן | PDkef'\nh1: 'איחוד קבצי PDF: מיזוג'\nsubhead: >-\n  x\n";
    expect(titlesFromYaml(yaml)).toEqual({
      seoTitle: 'איחוד קבצי PDF - בדפדפן | PDkef',
      h1: 'איחוד קבצי PDF: מיזוג',
    });
  });
});
