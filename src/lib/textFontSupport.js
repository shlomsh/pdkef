/**
 * Presentation model for font compatibility. All coverage and fallback choices
 * come from fonts.js (the same generated glyph data and transforms as export).
 * No fetching, timers, document mutations, or language-name guesses live here.
 */
import { covers, missingGlyphs, resolveFontSubstitution, TEXT_FONTS, HANDWRITING_FONTS } from './fonts.js';
import { textForCoverage } from './comb.js';

const families = [...TEXT_FONTS, ...HANDWRITING_FONTS];
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** A menu option and the result of picking it are different facts. */
export function getFontSupport(fontFamily, text = '', weight = 'normal', style = 'normal', drawnText = text) {
  const resolution = resolveFontSubstitution(fontFamily, text, weight, style);
  const missing = missingGlyphs(resolution.requested, weight, style, drawnText);
  const remaining = missingGlyphs(resolution.family, weight, style, drawnText);
  return {
    ...resolution,
    missing,
    remaining,
    status: remaining.length ? 'incompatible' : resolution.family !== resolution.requested ? 'fallback' : 'supported',
  };
}

/**
 * Suggest contiguous pieces only when a real font can render each whole piece.
 * Intersect per-grapheme candidates to find the next boundary; never split a
 * combining sequence or suggest removing marks. Final whole-piece validation
 * handles normalization across a boundary. This is advice, not an auto-layout
 * operation: text, order, spaces, placement and undo history remain untouched.
 */
function suggestTextBoxes(text, preferredFamily, weight, style) {
  const pieces = [];
  const clusterCoverage = new Map();
  let value = '';
  let candidates = families;
  const finish = () => {
    if (!value) return;
    const family = resolveFontSubstitution(preferredFamily, value, weight, style).family;
    pieces.push({ text: value, family: covers(family, weight, style, value) ? family : null });
  };
  for (const { segment } of segmenter.segment(text)) {
    if (!clusterCoverage.has(segment)) {
      clusterCoverage.set(segment, families.filter((family) => covers(family, weight, style, segment)));
    }
    const compatible = clusterCoverage.get(segment);
    const shared = candidates.filter((family) => compatible.includes(family));
    if (value && shared.length === 0) {
      finish();
      value = '';
      candidates = compatible;
    } else {
      candidates = shared;
    }
    value += segment;
  }
  finish();
  return pieces;
}

export function getTextFontSupport(element) {
  const text = element.text || '';
  const drawnText = textForCoverage(element);
  const weight = element.fontWeight || 'normal';
  const style = element.fontStyle || 'normal';
  const support = getFontSupport(element.fontFamily, text, weight, style, drawnText);
  const pieces = support.status === 'incompatible'
    ? suggestTextBoxes(drawnText, support.requested, weight, style)
    : [];
  return { ...support, pieces };
}

/** Bounded, direction-isolated text excerpts for English UI sentences. */
export function quoteText(text) {
  const chars = [...text.trim()];
  return `“\u2068${chars.slice(0, 36).join('')}${chars.length > 36 ? '…' : ''}\u2069”`;
}

export function describeTextFontSupport(support) {
  if (support.status === 'supported') return '';
  if (support.status === 'fallback') {
    return `Using ${support.family} so all your text is included. ${support.requested} is missing ${quoteText(support.missing.join(''))}. You can choose another matching font in the font menu.`;
  }
  const unavailable = support.pieces.filter((piece) => !piece.family);
  if (unavailable.length) {
    return `No available font includes ${quoteText(unavailable.map((piece) => piece.text).join(''))}. Please replace or remove those characters; you can keep the rest of your text.`;
  }
  const examples = support.pieces.slice(0, 3)
    .map((piece) => `${quoteText(piece.text)} in ${piece.family}`).join('; ');
  return `No single available font includes all this text. Keep the text by placing the parts in separate text boxes: ${examples}${support.pieces.length > 3 ? '; continue with the remaining parts' : ''}.`;
}
