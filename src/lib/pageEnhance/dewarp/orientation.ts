// Which way a flattened page's text runs (SCAN-32). A page photographed with the phone sideways comes
// out lying on its side: its text rows run down the image, and the row finder (lineBend) only sees rows
// running across. So the row finder is asked twice, of the page and of the page turned on its side
// (transposed), and the reading that finds clearly more text rows wins. A form's ruled lines are no
// evidence either way: a table has rules in both directions, and its rules run as far as it likes, so
// every long straight run of ink is set aside first, across and down. Which way is up is a second read,
// textUp, of the page once its rows run across. Pure: no DOM.
import type { GrayImage } from '../quad.ts';
import { inkMask } from './ink.ts';
import { lineSamples, ownLine, smear, type Sample } from './lineBend.ts';

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

/** A sideways reading must be this clear, (win - lose) / (win + lose): three times the other reading's
 * text. textTurn itself says nothing below 1/3; turning a page that was fine is worse than leaving one
 * sideways, which the person can turn with Rotate, so this asks for more. */
const MIN_SIDEWAYS_CONFIDENCE = 0.5;
/** A sideways page is first turned one quarter clockwise (turns counts clockwise quarters, quad.ts
 * rotateQuad); it stays so when its text does not say which way is up. */
const SIDEWAYS_TURNS = 1;
/** The rows must vote this clearly, three quarters of their length to one, to call a page upside down:
 * on 51 measured pages (SCAN-48) none read past it the wrong way, the worst being -0.31. */
const MIN_UPSIDE_DOWN = 0.5;
const HALF_TURN = 2;

/** How far a row is looked at above and below its baseline, as shares of the page's long edge: past a
 * headline's letters one way, past its descenders the other. */
const ROW_ABOVE = 0.05;
const ROW_BELOW = 0.015;
/** A row's letters are the heights around its fullest one that hold at least this share of it: a heavy top
 * line and a lighter middle stay one band, and the gap to the next row ends it. */
const BAND_SHARE = 1 / 3;
/** A row votes only when its halves differ by this share of the band's ink: letters do, a printed bar does not. */
const MIN_ROW_LEAN = 0.05;
/** The letters' band must be at least this tall in pixels to have two halves worth comparing. */
const MIN_BAND = 4;

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

/** The page's ink without its rules, across and down. */
function textMask(gray: GrayImage): Uint8Array {
  const { width: w, height: h } = gray;
  const ink = inkMask(gray);
  const len = Math.max(8, Math.round(Math.max(w, h) * RULE_RUN));
  const inkT = transpose(ink, w, h);
  const ruleAcross = runsAcross(ink, w, h, len);
  const ruleDown = transpose(runsAcross(inkT, h, w, len), h, w);
  const text = new Uint8Array(w * h);
  for (let i = 0; i < text.length; i += 1) text[i] = ink[i] & ((ruleAcross[i] | ruleDown[i]) ^ 1);
  return text;
}

/** What the text reads in each direction: the page's text rows across, and down (across it transposed). */
function textRows(gray: GrayImage): { across: { rows: number; length: number }; down: { rows: number; length: number } } {
  const { width: w, height: h } = gray;
  const text = textMask(gray);
  return { across: rowsAcross(text, w, h), down: rowsAcross(transpose(text, w, h), h, w) };
}

/**
 * @testSeam Read through pageTurns.
 * Whether the page's text rows run across it (turn 0) or down it (turn 1, a quarter turn needed), with
 * how clearly, 0..1; null when the page has too little text to say, or both directions alike. `gray` is
 * the flattened page at its measuring size (about 1000 pixels on the long edge).
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

/** The ink at each height around a row, measured from the row's own straight line, so a row that leans
 * does not smear its top into its bottom. */
function rowProfile(text: Uint8Array, w: number, h: number, row: Sample[]): Float64Array {
  const long = Math.max(w, h);
  const above = Math.round(long * ROW_ABOVE);
  const profile = new Float64Array(above + Math.round(long * ROW_BELOW) + 1);
  const line = ownLine(row);
  for (let x = Math.ceil(row[0].x * w); x < row[row.length - 1].x * w; x += 1) {
    const top = Math.round(line.at((x + 0.5) / w) * h) - above;
    for (let k = 0; k < profile.length; k += 1) {
      const y = top + k;
      if (y >= 0 && y < h && text[y * w + x]) profile[k] += 1;
    }
  }
  return profile;
}

/** Which half of its letters' band a row's ink sits in: 1 the top, -1 the bottom. The band is the run of
 * heights around the row's fullest one; null when it is too thin to halve, or its halves are alike. */
function rowVote(profile: Float64Array): number | null {
  let peak = 0;
  for (let k = 1; k < profile.length; k += 1) if (profile[k] > profile[peak]) peak = k;
  const floor = profile[peak] * BAND_SHARE;
  let top = peak;
  let bottom = peak;
  while (top > 0 && profile[top - 1] >= floor) top -= 1;
  while (bottom < profile.length - 1 && profile[bottom + 1] >= floor) bottom += 1;
  if (bottom - top + 1 < MIN_BAND) return null;
  let balance = 0;
  let ink = 0;
  for (let k = 0; k < (bottom - top + 1) >> 1; k += 1) {
    balance += profile[top + k] - profile[bottom - k];
    ink += profile[top + k] + profile[bottom - k];
  }
  return ink > 0 && Math.abs(balance) >= MIN_ROW_LEAN * ink ? Math.sign(balance) : null;
}

/**
 * @testSeam Read through pageTurns.
 * Which way up the page's text rows read, from -1 (upside down) to 1 (upright); null when it has too few
 * rows to say. Printed letters, Hebrew and Latin alike, carry more ink in the top half of their row, so
 * each row votes by its length. `gray` is the flattened page with its rows running across, at its
 * measuring size (about 1000 pixels on the long edge).
 */
export function textUp(gray: GrayImage): number | null {
  if (gray.width < 16 || gray.height < 16) return null;
  const { width: w, height: h } = gray;
  const text = textMask(gray);
  let up = 0;
  let total = 0;
  let voters = 0;
  for (const row of lineSamples(smear(text, w, h), w, h)) {
    const vote = rowVote(rowProfile(text, w, h, row));
    if (vote === null) continue;
    const length = row[row.length - 1].x - row[0].x;
    up += vote * length;
    total += length;
    voters += 1;
  }
  return voters < MIN_ROWS ? null : up / total;
}

/** The image turned `turns` quarters clockwise: at one, its left column becomes the top row. */
export function turnedClockwise(gray: GrayImage, turns: number): GrayImage {
  let image = gray;
  for (let k = 0; k < turns; k += 1) {
    const { width, height, data } = image;
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) out[x * height + (height - 1 - y)] = data[y * width + x];
    image = { width: height, height: width, data: out };
  }
  return image;
}

/**
 * The clockwise quarter turns that stand the page up, and how clearly its rows run the way textTurn read
 * them (0 when it says nothing). The text says whether the page lies sideways, then which way is up; a
 * page whose text does not say which way is up gets only the sideways turn. `gray` as for textTurn.
 */
export function pageTurns(gray: GrayImage): { turns: number; confidence: number } {
  const read = textTurn(gray);
  const sideways = !!read && read.turn === 1 && read.confidence >= MIN_SIDEWAYS_CONFIDENCE;
  const turns = sideways ? SIDEWAYS_TURNS : 0;
  // Only rows known to run across can say which way is up.
  const up = read && (sideways || read.turn === 0) ? textUp(turnedClockwise(gray, turns)) : null;
  return { turns: up !== null && up <= -MIN_UPSIDE_DOWN ? turns + HALF_TURN : turns, confidence: read?.confidence ?? 0 };
}
