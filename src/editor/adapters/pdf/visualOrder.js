/**
 * PDFs draw Hebrew and Arabic text in visual (left-to-right, on-screen) drawing
 * order rather than logical (reading) order: the content stream places glyphs
 * the way they end up on the page, not the way a person would type them. A
 * preview built by walking the content stream therefore comes out reversed
 * for RTL runs. `visualToLogical` undoes that for display purposes only.
 */

const RTL_CHAR = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const RTL_STRONG = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_STRONG = /[A-Za-z]/;
const LTR_RUN_CHAR = /[A-Za-z0-9 .,:/%-]/;
const LTR_LETTER_OR_DIGIT = /[A-Za-z0-9]/;

const BRACKET_MIRROR = new Map([
  ['(', ')'],
  [')', '('],
  ['[', ']'],
  [']', '['],
  ['{', '}'],
  ['}', '{'],
  ['<', '>'],
  ['>', '<'],
]);

const mirrorBrackets = (text) =>
  Array.from(text)
    .map((ch) => BRACKET_MIRROR.get(ch) ?? ch)
    .join('');

/**
 * Reverses `text` character by character, then restores every maximal LTR
 * run (LTR letters/digits plus the neutrals that bind them, such as
 * "12/03/2021" or "PDF file") back to left-to-right order, and mirrors any
 * bracket characters that remain in RTL context.
 */
const fixRtlBase = (text) => {
  const chars = Array.from(text);
  const reversed = chars.slice().reverse();
  const result = reversed.slice();

  let i = 0;
  while (i < result.length) {
    if (!LTR_RUN_CHAR.test(result[i])) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < result.length && LTR_RUN_CHAR.test(result[j])) j += 1;
    // Trim leading/trailing neutrals (e.g. spaces) off the candidate run: an
    // LTR run must start and end on an actual letter or digit.
    let start = i;
    let end = j;
    while (start < end && !LTR_LETTER_OR_DIGIT.test(result[start])) start += 1;
    while (end > start && !LTR_LETTER_OR_DIGIT.test(result[end - 1])) end -= 1;
    if (end - start > 0) {
      const run = result.slice(start, end).reverse();
      for (let k = 0; k < run.length; k += 1) result[start + k] = run[k];
    }
    i = j;
  }

  return mirrorBrackets(result.join(''));
};

/**
 * Reverses only each maximal run of RTL material (RTL letters plus the
 * spaces/marks binding RTL words together) in place, leaving LTR material
 * untouched.
 */
const fixLtrBase = (text) => {
  const chars = Array.from(text);
  const result = chars.slice();

  let i = 0;
  while (i < result.length) {
    if (!RTL_CHAR.test(result[i])) {
      i += 1;
      continue;
    }
    let j = i;
    let lastRtl = i;
    while (j < result.length && (RTL_CHAR.test(result[j]) || result[j] === ' ')) {
      if (RTL_CHAR.test(result[j])) lastRtl = j;
      j += 1;
    }
    const end = lastRtl + 1;
    const run = result.slice(i, end).reverse();
    for (let k = 0; k < run.length; k += 1) result[i + k] = run[k];
    i = end;
  }

  return result.join('');
};

/**
 * Converts a string decoded from a PDF content stream (visual/drawing order)
 * to logical (reading) order, for RTL scripts only. Text with no RTL
 * character is returned unchanged.
 */
export function visualToLogical(text) {
  if (!text || !RTL_CHAR.test(text)) return text;

  const rtlCount = (text.match(new RegExp(RTL_STRONG, 'g')) ?? []).length;
  const ltrCount = (text.match(new RegExp(LTR_STRONG, 'g')) ?? []).length;
  const baseIsRtl = rtlCount >= ltrCount;

  return baseIsRtl ? fixRtlBase(text) : fixLtrBase(text);
}
