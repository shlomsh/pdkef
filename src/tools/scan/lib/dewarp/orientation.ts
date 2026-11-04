// Which way a flattened page's text runs (SCAN-32). A page photographed with the phone sideways comes
// out lying on its side: its text rows run down the image, and the row finder (lineBend) only sees rows
// running across. So the row finder is asked twice, of the page and of the page turned on its side
// (transposed), and the reading that finds clearly more text rows wins. A form's ruled lines are no
// evidence either way: a table has rules in both directions, and its rules run as far as it likes, so
// every long straight run of ink is set aside first, across and down. Which quarter turn it is (90 or
// 270 degrees) the text alone does not say here; the caller picks it. Pure: no DOM.
import type { GrayImage } from '../quad.ts';
import { inkMask } from './ink.ts';
import { lineSamples, smear } from './lineBend.ts';

/** A straight run of ink at least this share of the page's long edge is a rule, not text: words end
 * well before it, a table's rules and a scan's dark borders do not. */
const RULE_RUN = 0.08;
/** Fewest text rows the winning reading must find... */
const MIN_ROWS = 4;
/** ...and their total length, in long edges of the page (four rows across half a portrait page). */
const MIN_TEXT = 1.5;
/** The winner's confidence, (win - lose) / (win + lose) over the rows' total length, must reach this:
 * twice the other reading's text. Below it the page does not say. */
const MIN_CONFIDENCE = 1 / 3;

/** `turn` 1: the text runs down the page, so it needs a quarter turn (either way) to read across. */
interface TextTurn { turn: 0 | 1; confidence: number }

function transpose(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out[x * h + y] = mask[y * w + x];
  return out;
}

/** Ink pixels on a run across the page at least `len` long. A run may step a row up or down as it goes,
 * so a rule that leans a little is still one run. */
function runsAcross(ink: Uint8Array, w: number, h: number, len: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const near = (x: number, y: number) => ink[y * w + x] || (y > 0 && ink[(y - 1) * w + x]) || (y < h - 1 && ink[(y + 1) * w + x]);
  for (let y = 0; y < h; y += 1) {
    let x = 0;
    while (x < w) {
      if (!near(x, y)) { x += 1; continue; }
      let end = x;
      while (end < w && near(end, y)) end += 1;
      if (end - x >= len) for (let k = x; k < end; k += 1) out[y * w + k] = ink[y * w + k];
      x = end;
    }
  }
  return out;
}

/** The text rows the row finder sees running across: how many, and their total length in pixels. */
function rowsAcross(text: Uint8Array, w: number, h: number): { rows: number; length: number } {
  const rows = lineSamples(smear(text, w, h), w, h);
  let length = 0;
  for (const r of rows) length += (r[r.length - 1].x - r[0].x) * w;
  return { rows: rows.length, length };
}

/** What the text reads in each direction: the page's text rows across, and down (across it transposed). */
function textRows(gray: GrayImage): { across: { rows: number; length: number }; down: { rows: number; length: number } } {
  const { width: w, height: h } = gray;
  const ink = inkMask(gray);
  const len = Math.max(8, Math.round(Math.max(w, h) * RULE_RUN));
  const inkT = transpose(ink, w, h);
  const ruleAcross = runsAcross(ink, w, h, len);
  const ruleDown = transpose(runsAcross(inkT, h, w, len), h, w);
  const text = new Uint8Array(w * h);
  for (let i = 0; i < text.length; i += 1) text[i] = ink[i] & ((ruleAcross[i] | ruleDown[i]) ^ 1);
  return { across: rowsAcross(text, w, h), down: rowsAcross(transpose(text, w, h), h, w) };
}

/**
 * Whether the page's text rows run across it (turn 0) or down it (turn 1, a quarter turn needed), with
 * how clearly, 0..1; null when the page has too little text to say, or both directions alike. `gray` is
 * the flattened page at its measuring size (about 1000 pixels on the long edge).
 * @testSeam Until SCAN-32 calls it from measureBend; drop this tag then.
 */
export function textTurn(gray: GrayImage): TextTurn | null {
  if (gray.width < 16 || gray.height < 16) return null;
  const { across, down } = textRows(gray);
  const win = across.length >= down.length ? across : down;
  const lose = win === across ? down : across;
  if (win.rows < MIN_ROWS || win.length < MIN_TEXT * Math.max(gray.width, gray.height)) return null;
  const confidence = (win.length - lose.length) / (win.length + lose.length);
  if (confidence < MIN_CONFIDENCE) return null;
  return { turn: win === across ? 0 : 1, confidence };
}
