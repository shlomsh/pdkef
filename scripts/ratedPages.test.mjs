import { describe, expect, it } from 'vitest';
import { ratedPageProblems, ratedPageTest } from './ratedPages.mjs';

const isRatedPage = ratedPageTest(['sign', 'redact']);

describe('ratedPageTest', () => {
  it.each(['dist/index.html', 'dist/he/index.html', 'dist/sign/index.html', 'dist/he/sign/index.html'])('%s carries the rating', (page) => {
    expect(isRatedPage(page)).toBe(true);
  });
  it.each(['dist/about/index.html', 'dist/he/about/index.html', 'dist/sign/more/index.html', 'dist/sign-pdf-no-signup/index.html'])('%s does not', (page) => {
    expect(isRatedPage(page)).toBe(false);
  });
});

describe('ratedPageProblems', () => {
  const problems = (pages) => ratedPageProblems(new Map(Object.entries(pages)), isRatedPage);

  it('passes when every home and tool page is rated and no other page is', () => {
    expect(problems({ 'dist/index.html': true, 'dist/sign/index.html': true, 'dist/about/index.html': false })).toEqual([]);
  });
  it('passes a build with no store, which rates nothing', () => {
    expect(problems({ 'dist/index.html': false, 'dist/sign/index.html': false })).toEqual([]);
  });
  it('names a tool page left without the rating', () => {
    expect(problems({ 'dist/index.html': true, 'dist/sign/index.html': false })).toEqual([expect.stringMatching(/^dist\/sign\/index\.html: no aggregateRating/)]);
  });
  it('names a rating on any other page', () => {
    expect(problems({ 'dist/index.html': true, 'dist/about/index.html': true })).toEqual([expect.stringMatching(/^dist\/about\/index\.html: aggregateRating on a page/)]);
  });
});
