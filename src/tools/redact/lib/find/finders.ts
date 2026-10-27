/**
 * RED-02: pure text finders over `PageText.text` (see `types.ts`). No DOM, no
 * pdf.js import; the same text always gives the same ranges.
 *
 * `foldForSearch` gives every finder a script-neutral, case-neutral view of
 * the raw text plus a map back to raw offsets, so a term search and a preset
 * regex both work on visible characters only: Hebrew niqqud, Arabic harakat,
 * zero-width marks and whitespace runs never change whether two spellings
 * match.
 */

import type { Finder, TextRange } from './types.ts';

/** Hebrew points and cantillation, except the four that are punctuation. */
function isHebrewMark(code: number): boolean {
  if (code < 0x0591 || code > 0x05c7) return false;
  return code !== 0x05be && code !== 0x05c0 && code !== 0x05c3 && code !== 0x05c6;
}

/** Arabic harakat (short vowels, sukun, shadda, tanwin) and superscript alef. */
function isArabicMark(code: number): boolean {
  return (code >= 0x064b && code <= 0x065f) || code === 0x0670;
}

/** Zero-width joins, directional marks and formatting characters. */
function isZeroWidth(code: number): boolean {
  if (code === 0x00ad || code === 0xfeff) return true;
  if (code >= 0x200b && code <= 0x200f) return true;
  if (code >= 0x202a && code <= 0x202e) return true;
  if (code >= 0x2066 && code <= 0x2069) return true;
  return false;
}

function isRemovedCode(code: number): boolean {
  return isHebrewMark(code) || isArabicMark(code) || isZeroWidth(code);
}

/** Hyphens and dashes unified to '-'. */
function isDashCode(code: number): boolean {
  return (code >= 0x2010 && code <= 0x2015) || code === 0x2212;
}

const STRAIGHT_QUOTES: Record<string, string> = {
  '‘': "'", '’': "'", '‛': "'",
  '“': '"', '”': '"', '‟': '"',
};

/** Any whitespace, including a line break and NBSP; run-folded to one ' '. */
function isSpaceChar(ch: string): boolean {
  return /\s/.test(ch) || ch === ' ';
}

/**
 * Case-folds, NFKC-normalizes per character, drops marks and zero-width
 * characters, collapses whitespace runs to one ' ', and unifies dashes and
 * curly quotes. `toRaw` has `folded.length + 1` entries: `toRaw[i]` is the
 * raw index where `folded[i]` started, and `toRaw[folded.length]` is
 * `text.length`, so any folded `[start, end)` maps back to a raw range.
 */
export function foldForSearch(text: string): { folded: string; toRaw: number[] } {
  let folded = '';
  const toRaw: number[] = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    const ch = text[i];
    const code = text.charCodeAt(i);

    if (isRemovedCode(code)) {
      i += 1;
      continue;
    }

    if (isSpaceChar(ch)) {
      const start = i;
      let j = i + 1;
      while (j < len && isSpaceChar(text[j])) j += 1;
      folded += ' ';
      toRaw.push(start);
      i = j;
      continue;
    }

    if (isDashCode(code)) {
      folded += '-';
      toRaw.push(i);
      i += 1;
      continue;
    }

    const straight = STRAIGHT_QUOTES[ch];
    if (straight) {
      folded += straight;
      toRaw.push(i);
      i += 1;
      continue;
    }

    const mapped = ch.toLocaleLowerCase('und').normalize('NFKC');
    for (const mappedChar of mapped) {
      folded += mappedChar;
      toRaw.push(i);
    }
    i += 1;
  }

  toRaw.push(len);
  return { folded, toRaw };
}

/**
 * Finds every non-overlapping occurrence of `term` in text, ignoring case,
 * niqqud/harakat, zero-width marks, dash style and quote style, and treating
 * any run of whitespace in the term (including a line break) as matching any
 * run of whitespace in the text. Trailing marks that belong to the last
 * matched letter (e.g. Hebrew niqqud right after it) are folded into the
 * match. An empty term (after folding and trimming) finds nothing.
 */
export function termFinder(term: string): Finder {
  const foldedTerm = foldForSearch(term).folded.trim();
  if (!foldedTerm) return () => [];

  return (text: string): TextRange[] => {
    const { folded, toRaw } = foldForSearch(text);
    const ranges: TextRange[] = [];
    let from = 0;

    while (from <= folded.length - foldedTerm.length) {
      const foldedStart = folded.indexOf(foldedTerm, from);
      if (foldedStart === -1) break;
      const foldedEnd = foldedStart + foldedTerm.length;

      const start = toRaw[foldedStart];
      let end = toRaw[foldedEnd];
      while (end < text.length && isRemovedCode(text.charCodeAt(end))) {
        end += 1;
      }

      ranges.push({ start, end });
      from = foldedEnd;
    }

    return ranges;
  };
}

function isWordCode(code: number): boolean {
  // ASCII letters/digits/underscore: keeps a preset from matching a digit run
  // that is really part of a longer alphanumeric token (an id, a code).
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

/** One proposal per shape, in order: earliest, then longest at that start. */
function sortAndDedupe(ranges: TextRange[]): TextRange[] {
  ranges.sort((a, b) => (a.start - b.start) || (b.end - a.end));
  const out: TextRange[] = [];
  let lastEnd = -1;
  for (const range of ranges) {
    if (range.start < lastEnd) continue;
    out.push(range);
    lastEnd = range.end;
  }
  return out;
}

/** local@domain.tld: a pragmatic RFC-ish shape, not full RFC 5322. */
const EMAIL_RE = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/g;

function emailFinder(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (const match of text.matchAll(EMAIL_RE)) {
    const start = match.index ?? 0;
    ranges.push({ start, end: start + match[0].length });
  }
  return ranges;
}

/** +country, spaced/dotted/dashed/parenthesised local or international shapes. */
const PHONE_CANDIDATE_RE = /(?<![\d])(\+?\(?\d[\d\s().-]{4,18}\d)(?![\d])/g;

function isDateLike(raw: string): boolean {
  const match = raw.match(/^(\d{1,4})([/.-])(\d{1,2})\2(\d{1,4})$/);
  if (!match) return false;
  const [, a, , b, c] = match;
  return (a.length === 4 && b.length <= 2 && c.length <= 2) || (a.length <= 2 && b.length <= 2 && c.length === 4);
}

/** The digit groups a shape has, in order, ignoring the separators between them. */
function digitGroupLengths(raw: string): number[] {
  return (raw.match(/\d+/g) ?? []).map((group) => group.length);
}

/** 3-2-4: a Social Security Number, not a phone number. */
function isSsnShaped(groups: number[]): boolean {
  return groups.length === 3 && groups[0] === 3 && groups[1] === 2 && groups[2] === 4;
}

/** 3-3-4 (a local mobile shape) or a leading '+'/'(': what the phone preset would claim. */
function isPhoneShaped(raw: string, groups: number[]): boolean {
  if (raw.startsWith('+') || raw.startsWith('(')) return true;
  return groups.length === 3 && groups[0] === 3 && groups[1] === 3 && groups[2] === 4;
}

function phoneFinder(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (const match of text.matchAll(PHONE_CANDIDATE_RE)) {
    const raw = match[1];
    const start = (match.index ?? 0) + match[0].indexOf(raw);
    const digitCount = (raw.match(/\d/g) ?? []).length;
    if (digitCount < 7 || digitCount > 15) continue;
    if (isDateLike(raw)) continue;
    const groups = digitGroupLengths(raw);
    if (isSsnShaped(groups)) continue;
    // One unbroken run is a phone number only with a trunk '0' or a '+' in
    // front (0541234567, +972541234567); a bare run like 123456782 is an ID.
    if (groups.length === 1 && !/^[+0]/.test(raw)) continue;
    ranges.push({ start, end: start + raw.length });
  }
  return sortAndDedupe(ranges);
}

/** 8-19 digits, plain or grouped by spaces/dashes (Israeli id, SSN, card, IBAN-free digits). */
const ID_SOLID_RE = /\d{8,19}/g;
const ID_GROUPED_RE = /\d{2,4}(?:[ -]\d{2,4}){1,5}/g;

function collectIdCandidates(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (const re of [ID_SOLID_RE, ID_GROUPED_RE]) {
    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const before = start > 0 ? text.charCodeAt(start - 1) : -1;
      const after = end < text.length ? text.charCodeAt(end) : -1;
      if (isWordCode(before) || isWordCode(after)) continue;
      const digitCount = (match[0].match(/\d/g) ?? []).length;
      if (digitCount < 8 || digitCount > 19) continue;
      if (isDateLike(match[0])) continue;
      if (isPhoneShaped(match[0], digitGroupLengths(match[0]))) continue;
      ranges.push({ start, end });
    }
  }
  return sortAndDedupe(ranges);
}

/**
 * Pragmatic shapes only, on the raw text (no folding needed: digits and `@`
 * read the same regardless of script). These are proposals for a person to
 * review, not a guarantee of what they find or miss.
 *
 * - `email`: local@domain.tld.
 * - `phone`: `+country` and local shapes with spaces/dots/dashes/parens, 7-15
 *   digits, not part of a longer digit run, excluding plain dates and a 3-2-4
 *   (SSN) grouping.
 * - `idNumber`: 8-19 digits, solid or grouped by spaces or dashes, not part
 *   of a longer digit or letter run, excluding dates and any shape (3-3-4, or
 *   a leading '+'/'(') the phone preset would claim.
 */
export const PRESET_FINDERS: Record<'email' | 'phone' | 'idNumber', Finder> = {
  email: emailFinder,
  phone: phoneFinder,
  idNumber: collectIdCandidates,
};
