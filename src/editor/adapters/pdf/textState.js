// @ts-check
import { multiplyMatrix } from './contentStream.js';

/**
 * The PDF text state, as plain values, and the one place its operators are interpreted
 * (`Tf Tc Tw Tz TL Ts Tm Td TD T*`). Every function returns the next state and never mutates the
 * one it is given, so a caller keeps whichever copy it needs.
 *
 * @typedef {object} TextState
 * @property {import('./contentStream.js').Matrix} tm text matrix
 * @property {import('./contentStream.js').Matrix} tlm text line matrix
 * @property {import('./pdfFonts.js').FontEntry|null} font the font table entry `Tf` selected, if known
 * @property {string|null} fontKey `/Name` of that font resource, null when `Tf` named none
 * @property {number} fontSize
 * @property {number} charSpacing `Tc`
 * @property {number} wordSpacing `Tw`
 * @property {number} horizontalScale `Tz` as a fraction (1 = 100%)
 * @property {number} leading `TL`
 * @property {number} rise `Ts`
 */

/** @type {import('./contentStream.js').Matrix} */
const IDENTITY = [1, 0, 0, 1, 0, 0];

/** @returns {TextState} the state before any text operator has run. */
export function initialTextState() {
  return {
    tm: IDENTITY,
    tlm: IDENTITY,
    font: null,
    fontKey: null,
    fontSize: 0,
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScale: 1,
    leading: 0,
    rise: 0,
  };
}

/** The number at `operands[index]`, 0 when it is missing or not a number.
 * @param {import('./contentStream.js').Token[]} operands
 * @param {number} index
 * @returns {number}
 */
export const operandNumber = (operands, index) => {
  const token = operands[index];
  return token?.type === 'number' ? token.value : 0;
};

/** `BT`: both matrices go back to identity; font, size and spacing carry over.
 * @param {TextState} state
 * @returns {TextState}
 */
export const beginText = (state) => ({ ...state, tm: IDENTITY, tlm: IDENTITY });

/** Moves to the start of the next line by (tx, ty), as `Td`, `TD`, `T*`, `'` and `"` do.
 * @param {TextState} state
 * @param {number} tx
 * @param {number} ty
 * @returns {TextState}
 */
const moveToLine = (state, tx, ty) => {
  const tlm = multiplyMatrix([1, 0, 0, 1, tx, ty], state.tlm);
  return { ...state, tlm, tm: tlm };
};

/** The `T*` move: one leading down.
 * @param {TextState} state
 * @returns {TextState}
 */
export const moveToNextLine = (state) => moveToLine(state, 0, -state.leading);

/** Slides the text matrix along the line by `dx` text-space units, as a glyph or a `TJ` kern does.
 * @param {TextState} state
 * @param {number} dx
 * @returns {TextState}
 */
export const advanceText = (state, dx) => ({ ...state, tm: multiplyMatrix([1, 0, 0, 1, dx, 0], state.tm) });

/** The spacing operands of `"`: word spacing, then character spacing, before the string.
 * @param {TextState} state
 * @param {import('./contentStream.js').Token[]} operands
 * @returns {TextState}
 */
export const setQuoteSpacing = (state, operands) => ({
  ...state,
  wordSpacing: operandNumber(operands, operands.length - 3),
  charSpacing: operandNumber(operands, operands.length - 2),
});

/**
 * Applies one text-state operator. Any other operator returns `state` itself.
 *
 * @param {TextState} state
 * @param {string} operator
 * @param {import('./contentStream.js').Token[]} operands the tokens collected since the previous operator
 * @param {Map<string, import('./pdfFonts.js').FontEntry>} fonts the stream's font table, keyed `/Name`
 * @returns {TextState}
 */
export function applyTextStateOperator(state, operator, operands, fonts) {
  const last = operands.length - 1;
  /** @param {number} index */
  const num = (index) => operandNumber(operands, index);
  switch (operator) {
    case 'Tf': {
      const name = operands[operands.length - 2];
      const fontKey = name?.type === 'name' ? `/${name.value}` : null;
      return { ...state, fontKey, font: fontKey ? fonts.get(fontKey) ?? null : null, fontSize: num(last) };
    }
    case 'Tc':
      return { ...state, charSpacing: num(last) };
    case 'Tw':
      return { ...state, wordSpacing: num(last) };
    case 'Tz':
      return { ...state, horizontalScale: num(last) / 100 };
    case 'TL':
      return { ...state, leading: num(last) };
    case 'Ts':
      return { ...state, rise: num(last) };
    case 'Tm': {
      /** @type {import('./contentStream.js').Matrix} */
      const tlm = [num(0), num(1), num(2), num(3), num(4), num(5)];
      return { ...state, tlm, tm: tlm };
    }
    case 'Td':
      return moveToLine(state, num(operands.length - 2), num(last));
    case 'TD':
      return moveToLine({ ...state, leading: -num(last) }, num(operands.length - 2), num(last));
    case 'T*':
      return moveToNextLine(state);
    default:
      return state;
  }
}

/** Distance one character code advances the text cursor along the line, in text-space units.
 * @param {TextState} state
 * @param {number} code
 * @returns {number}
 */
export function glyphAdvance(state, code) {
  const { font } = state;
  const glyphWidth = (font?.widths.get(code) ?? font?.defaultWidth ?? 500) * (font?.widthScale ?? 0.001);
  // Word spacing applies to single-byte code 32 only.
  const applyWordSpacing = !font?.twoByte && code === 32;
  return (
    glyphWidth * state.fontSize + state.charSpacing + (applyWordSpacing ? state.wordSpacing : 0)
  ) * state.horizontalScale;
}

/** The shift a `TJ` number element makes along the line, in text-space units.
 * @param {TextState} state
 * @param {number} amount
 * @returns {number}
 */
export const kernShift = (state, amount) => (-amount / 1000) * state.fontSize * state.horizontalScale;
