/**
 * RED-46: the /redact/ copy says what happens in plain words. These pin the
 * retired jargon so it does not drift back in, and keep "flatten" to the one
 * FAQ entry that explains the word.
 */
import { describe, it, expect } from 'vitest';
import { contentPages } from './contentPages.js';
import { toolsBySlug } from './tools.js';
import { getToolCardCopy } from '../i18n/cardMessages.ts';

const redact = toolsBySlug.redact;
const FLATTEN_QUESTION = 'Do I need to flatten the PDF myself?';

const banned = [
  /\bareas?\b/i,
  /\belements?\b/i,
  /text layers?/i,
  /one image/i,
  /one-way/i,
  /marked page/i,
  /\bbakes?\b/i,
  /visual mask/i,
  /altered pixels/i,
];

const fields = [
  ['gridDescription', redact.gridDescription],
  ['subhead', redact.subhead],
  ['aboutLead', redact.aboutLead],
  ['seoTitle', redact.seoTitle],
  ['seoDescription', redact.seoDescription],
  ['h1', redact.h1],
  ...redact.steps.map((step, i) => [`steps[${i}].text`, step.text]),
  ...redact.faq.flatMap((entry, i) => [
    [`faq[${i}].question`, entry.question],
    [`faq[${i}].answer`, entry.answer],
  ]),
];

describe('redact page copy', () => {
  it.each(banned.map((re) => [String(re), re]))('has no %s', (_name, re) => {
    const hits = fields.filter(([, text]) => re.test(text)).map(([name]) => name);
    expect(hits).toEqual([]);
  });

  it('mentions flatten only in the FAQ entry that explains it', () => {
    const hits = fields.filter(([, text]) => /flatten/i.test(text)).map(([name]) => name);
    const index = redact.faq.findIndex((entry) => entry.question === FLATTEN_QUESTION);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(hits.every((name) => name.startsWith(`faq[${index}].`))).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('does not say selectable in the grid description or subhead', () => {
    expect(redact.gridDescription).not.toContain('selectable');
    expect(redact.subhead).not.toContain('selectable');
  });

  it('keeps flatten and element out of the two related guide blurbs', () => {
    for (const href of ['/blur-vs-blackout-vs-delete-pdf/', '/permanently-delete-text-from-pdf/']) {
      const page = contentPages.find((p) => p.href === href);
      expect(page, href).toBeTruthy();
      expect(page.blurb).not.toMatch(/flatten/i);
      expect(page.blurb).not.toMatch(/\belements?\b/i);
    }
  });

  it('keeps the Hebrew card free of the word for areas', () => {
    expect(getToolCardCopy('he', 'redact').description).not.toContain('אזורים');
  });

  it('has a FAQ entry saying the file\'s details are kept unless the person changes them', () => {
    const entry = redact.faq.find((e) => e.question === "What about the file's details, like author and title?");
    expect(entry).toBeTruthy();
    expect(entry.answer).toContain('keeps them as they came, unless you change them');
    expect(entry.answer).toContain('cached picture of a page');
    expect(entry.answer).not.toContain('every download');
  });
});
