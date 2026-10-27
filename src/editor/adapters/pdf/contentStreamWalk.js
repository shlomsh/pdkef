import { tokenize, multiplyMatrix, applyMatrix, transformedUnitBox } from './contentStream.js';
import { buildFontTable, decodeCodes, FALLBACK_ASCENT, FALLBACK_DESCENT } from './pdfFonts.js';
import { buildXObjectTable } from './xobjectTable.js';
import { closedMark, foldIntoMark } from './pdkefMark.js';
import { joinRuns, textDictRange, unionStrips } from './textRunJoin.js';
import {
  initialTextState,
  applyTextStateOperator,
  beginText,
  moveToNextLine,
  advanceText,
  setQuoteSpacing,
  glyphAdvance,
  kernShift,
  operandNumber,
} from './textState.js';

// The families share no operator, so the first that takes one is the only that could.
const OPERATOR_FAMILIES = [graphicsOperator, pathOperator, markedContentOperator, xobjectOperator, textOperator];

/** A number as a content stream may write it: plain decimal, never exponent notation. */
const pdfNumber = (n) => String(Number(n.toFixed(4)));

const rectOf = (min, max) => ({ x: min[0], y: min[1], width: max[0] - min[0], height: max[1] - min[1] });

/** The smallest [min, max] corner pair holding the current pair (when there is one) and `box`. */
function growCorners(min, max, box) {
  const lo = [box.x, box.y];
  const hi = [box.x + box.width, box.y + box.height];
  return min ? [
    [Math.min(min[0], lo[0]), Math.min(min[1], lo[1])],
    [Math.max(max[0], hi[0]), Math.max(max[1], hi[1])],
  ] : [lo, hi];
}

/**
 * Walks one content stream, pushing what it draws onto `env.objects` and the `BT ... ET` spans onto
 * `env.blocks`. The walk's own state (graphics state, text state, the show operation being read) lives
 * in one mutable `walk` record that the operator handlers below read and update.
 *
 * @param {Uint8Array} streamBytes decoded content of the holding stream
 * @param {object|undefined} streamResources
 * @param {number[]} baseCtm matrix mapping this stream's space to the page
 * @param {string[]} formPath
 * @param {{
 *   context: object, pageIndex: number, objects: Array, blocks: Array, mark: object,
 *   walkForm: (form: object, resources: object|undefined, ctm: number[], formPath: string[]) => void,
 * }} env what the page walk shares with every stream it reaches, nested Forms included
 */
export function walkContentStream(streamBytes, streamResources, baseCtm, formPath, env) {
  const tokens = tokenize(streamBytes);
  const walk = {
    ...env,
    streamResources,
    baseCtm,
    formPath,
    key: formPath.join('>'),
    fonts: buildFontTable(env.context, streamResources),
    xobjects: buildXObjectTable(env.context, streamResources),
    ctm: baseCtm,
    ctmStack: [],
    operands: [],
    lineWidth: 1,
    lineWidthStack: [],
    // Current path (RED-55): its points in page space, kept only to size a mark; outside a mark a
    // path is never a unit.
    pathPoints: [],
    // Marked-content sequences open in this stream, innermost last. `strip` is the byte range of an
    // inline property dict that may hold a copy of the text (/ActualText, /Alt, /E), else null. A BDC
    // naming a /Properties resource instead is out of scope: its dict is not in the stream to cut.
    sequences: [],
    // Text object state, live only between BT and ET.
    ts: initialTextState(),
    inText: false,
    textStart: 0,
    runMin: null,
    runMax: null,
    // The same for the show operation being read, and the x shift it causes.
    opMin: null,
    opMax: null,
    opShift: 0,
    opFrom: [0, 0], // where the show operation starts, in page space (RED-54 join)
    // Units of the open BT..ET, held until ET says whether a vertical font turns them into the block.
    pending: [],
    blockVertical: false,
  };

  for (const token of tokens) {
    if (token.type !== 'operator') {
      walk.operands.push(token);
      continue;
    }
    OPERATOR_FAMILIES.some((handle) => handle(walk, token));
    walk.operands = [];
  }

  // The stream that opened a mark ended with it open: it is no mark, so what it held is offered as is.
  if (walk.mark.open && walk.mark.owner === walk.key) {
    const { units } = walk.mark;
    Object.assign(walk.mark, closedMark());
    walk.objects.push(...units);
  }
}

const num = (walk, index) => operandNumber(walk.operands, index);
const lastNum = (walk) => num(walk, walk.operands.length - 1);

/** A dict a show op sits in is read when the op runs: a BDC can open and close inside BT..ET. */
const openStrips = (walk) => walk.sequences.filter((s) => s.strip).map((s) => s.strip);

/** Every unit this stream reports goes through here, so a rule about which units a page offers lives in one place. */
function emit(walk, object) {
  if (object.kind === 'text') {
    const strip = unionStrips([object.strip, openStrips(walk)]);
    if (strip.length) object.strip = strip;
  }
  if (walk.mark.open) {
    foldIntoMark(walk.mark, object.bbox);
    if (object.imageRef) walk.mark.imageRefs.add(object.imageRef);
    walk.mark.units.push(object);
  } else walk.objects.push(object);
}

/** `q Q cm`. */
function graphicsOperator(walk, token) {
  switch (token.value) {
    case 'q':
      walk.ctmStack.push(walk.ctm);
      walk.lineWidthStack.push(walk.lineWidth);
      return true;
    case 'Q':
      walk.ctm = walk.ctmStack.pop() ?? walk.baseCtm;
      walk.lineWidth = walk.lineWidthStack.pop() ?? 1;
      return true;
    case 'cm':
      walk.ctm = multiplyMatrix([num(walk, 0), num(walk, 1), num(walk, 2), num(walk, 3), num(walk, 4), num(walk, 5)], walk.ctm);
      return true;
    default:
      return false;
  }
}

const notePoints = (walk, ...coords) => {
  for (let i = 0; i + 1 < coords.length; i += 2) walk.pathPoints.push(applyMatrix(walk.ctm, coords[i], coords[i + 1]));
};

/** A painted path folds into the open mark, stroke width included; outside a mark it is dropped. */
function paintPath(walk) {
  const { pathPoints, ctm } = walk;
  if (walk.mark.open && pathPoints.length) {
    const xs = pathPoints.map((p) => p[0]);
    const ys = pathPoints.map((p) => p[1]);
    const [a, b, c, d] = ctm;
    const half = (walk.lineWidth * (Math.hypot(a, b) + Math.hypot(c, d))) / 4;
    foldIntoMark(walk.mark, {
      x: Math.min(...xs) - half,
      y: Math.min(...ys) - half,
      width: Math.max(...xs) - Math.min(...xs) + 2 * half,
      height: Math.max(...ys) - Math.min(...ys) + 2 * half,
    });
  }
  walk.pathPoints = [];
}

/** Path construction and painting: only their extent matters, and only inside a mark. */
function pathOperator(walk, token) {
  const n = (index) => num(walk, index);
  switch (token.value) {
    case 'w':
      walk.lineWidth = lastNum(walk);
      return true;
    case 'm':
    case 'l':
      notePoints(walk, n(0), n(1));
      return true;
    case 'c':
      notePoints(walk, n(0), n(1), n(2), n(3), n(4), n(5));
      return true;
    case 'v':
    case 'y':
      notePoints(walk, n(0), n(1), n(2), n(3));
      return true;
    case 're':
      notePoints(walk, n(0), n(1), n(0) + n(2), n(1), n(0), n(1) + n(3), n(0) + n(2), n(1) + n(3));
      return true;
    case 'S': case 's': case 'f': case 'F': case 'f*':
    case 'B': case 'B*': case 'b': case 'b*': case 'n':
      paintPath(walk);
      return true;
    default:
      return false;
  }
}

/** `BMC`/`BDC`: opens a sequence, and a `/PDkef` one opens a mark when none is open. */
function openSequence(walk, op) {
  const { operands, mark } = walk;
  const tag = operands[operands.length - (op === 'BMC' ? 1 : 2)];
  walk.sequences.push({ strip: op === 'BDC' ? textDictRange(operands[operands.length - 1]) : null });
  if (mark.open) {
    if (mark.owner === walk.key) mark.depth += 1;
  } else if (tag?.type === 'name' && tag.value === 'PDkef') {
    Object.assign(mark, closedMark(), { open: true, owner: walk.key, depth: 1, start: tag.start });
  }
}

/** `EMC`: closes a sequence, and the mark's last one turns what it drew into one unit. */
function closeSequence(walk, token) {
  const { mark, objects, formPath } = walk;
  walk.sequences.pop();
  if (!(mark.open && mark.owner === walk.key && --mark.depth === 0)) return;
  const { min, max, units, drawsForm, start: markStart, imageRefs } = mark;
  Object.assign(mark, closedMark());
  // A mark that drew a Form could not be deleted whole: the Form's content would stay.
  if (drawsForm || !min) {
    objects.push(...units);
    return;
  }
  objects.push({
    kind: 'mark',
    pageIndex: walk.pageIndex,
    formPath,
    bbox: { x: min[0], y: min[1], width: max[0] - min[0], height: max[1] - min[1] },
    // The images it drew, so deleting the mark can drop them if nothing else does.
    ...(imageRefs.size ? { imageRefs: [...imageRefs] } : {}),
    start: markStart,
    end: token.end,
  });
}

/** `BMC BDC EMC`. */
function markedContentOperator(walk, token) {
  switch (token.value) {
    case 'BMC':
    case 'BDC':
      openSequence(walk, token.value);
      return true;
    case 'EMC':
      closeSequence(walk, token);
      return true;
    default:
      return false;
  }
}

/** `Do`: an image is a unit; a Form is walked in place. */
function xobjectOperator(walk, token) {
  if (token.value !== 'Do') return false;
  const name = walk.operands[walk.operands.length - 1];
  const xobjectKey = name?.type === 'name' ? `/${name.value}` : null;
  const entry = xobjectKey ? walk.xobjects.get(xobjectKey) : undefined;
  if (entry?.isImage) {
    // Span covers the `/Name` operand as well as `Do`, so no orphan name
    // is left behind. The preceding `cm` stays: it sits inside the
    // enclosing q/Q and is undone by the `Q` regardless.
    emit(walk, {
      kind: 'image',
      pageIndex: walk.pageIndex,
      name: xobjectKey,
      ...(entry.imageRef ? { imageRef: entry.imageRef } : {}),
      formPath: walk.formPath,
      bbox: transformedUnitBox(walk.ctm),
      start: name.start,
      end: token.end,
    });
  } else if (entry?.form) {
    if (walk.mark.open) walk.mark.drawsForm = true;
    walk.walkForm(entry.form, walk.streamResources, walk.ctm, walk.formPath);
  }
  return true;
}

/** Grows the text object's run box and the show operation's box to hold `box`. */
function noteBox(walk, box) {
  [walk.runMin, walk.runMax] = growCorners(walk.runMin, walk.runMax, box);
  [walk.opMin, walk.opMax] = growCorners(walk.opMin, walk.opMax, box);
}

/** The glyphs of one shown string: each grows the boxes and moves the cursor. */
function showString(walk, bytesOfString) {
  const { font, fontSize, rise } = walk.ts;
  const ascent = (font?.ascent ?? FALLBACK_ASCENT) * fontSize + rise;
  const descent = (font?.descent ?? FALLBACK_DESCENT) * fontSize + rise;

  for (const code of decodeCodes(bytesOfString, font)) {
    const advance = glyphAdvance(walk.ts, code);
    const trm = multiplyMatrix(walk.ts.tm, walk.ctm);
    const corners = [
      applyMatrix(trm, 0, descent),
      applyMatrix(trm, advance, descent),
      applyMatrix(trm, 0, ascent),
      applyMatrix(trm, advance, ascent),
    ];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    noteBox(walk, {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    });
    walk.ts = advanceText(walk.ts, advance);
    walk.opShift += advance;
  }
}

/**
 * Ends one show operation: a unit when it showed a glyph. `prefix` is what a `'` or `"` does before
 * showing (it moves the line and, for `"`, sets spacing), which the replacement must repeat.
 */
function endShow(walk, firstOperand, token, prefix) {
  const { ts } = walk;
  if (ts.font?.vertical) walk.blockVertical = true;
  if (walk.opMin) {
    const trm = multiplyMatrix(ts.tm, walk.ctm);
    const scale = ts.fontSize * ts.horizontalScale;
    const advance = scale ? `[${pdfNumber((-walk.opShift * 1000) / scale)}] TJ` : '';
    const strips = openStrips(walk);
    walk.pending.push({
      kind: 'text',
      pageIndex: walk.pageIndex,
      formPath: walk.formPath,
      bbox: rectOf(walk.opMin, walk.opMax),
      start: firstOperand.start,
      end: token.end,
      replacement: [...prefix, advance].filter(Boolean).join(' '),
      ...(strips.length ? { strip: strips } : {}),
      run: {
        fontKey: ts.fontKey,
        size: ts.fontSize,
        scale: Math.hypot(trm[0], trm[1]) || 1,
        from: walk.opFrom,
        to: applyMatrix(trm, 0, 0),
      },
    });
  }
  walk.opMin = null;
  walk.opMax = null;
  walk.opShift = 0;
}

const isString = (token) => token?.type === 'string' || token?.type === 'hexstring';

/** `Tj`, `'` and `"`. */
function showText(walk, token) {
  const op = token.value;
  const { operands } = walk;
  const prefix = [];
  if (op !== 'Tj') walk.ts = moveToNextLine(walk.ts);
  if (op === '"') {
    walk.ts = setQuoteSpacing(walk.ts, operands);
    prefix.push(`${pdfNumber(walk.ts.wordSpacing)} Tw`, `${pdfNumber(walk.ts.charSpacing)} Tc`);
  }
  if (op !== 'Tj') prefix.push('T*');
  walk.opFrom = applyMatrix(multiplyMatrix(walk.ts.tm, walk.ctm), 0, 0);
  const str = operands[operands.length - 1];
  if (isString(str)) showString(walk, str.value);
  endShow(walk, operands[operands.length - (op === '"' ? 3 : 1)] ?? token, token, prefix);
}

/** `TJ`: strings and the kerns between them. */
function showTextArray(walk, token) {
  const arr = walk.operands[walk.operands.length - 1];
  walk.opFrom = applyMatrix(multiplyMatrix(walk.ts.tm, walk.ctm), 0, 0);
  if (arr?.type === 'array') {
    for (const item of arr.value) {
      if (item.type === 'number') {
        // A kern: shifts the cursor without drawing.
        const shift = kernShift(walk.ts, item.value);
        walk.ts = advanceText(walk.ts, shift);
        walk.opShift += shift;
      } else if (isString(item)) {
        showString(walk, item.value);
      }
    }
  }
  endShow(walk, arr ?? token, token, []);
}

/** `ET`: the block is reported, and its units are offered joined, or whole when the font is vertical. */
function endTextObject(walk, token) {
  if (walk.inText && walk.runMin && walk.runMax) {
    const block = { formPath: walk.formPath, bbox: rectOf(walk.runMin, walk.runMax), start: walk.textStart, end: token.end };
    walk.blocks.push(block);
    if (walk.blockVertical) emit(walk, { kind: 'text', pageIndex: walk.pageIndex, ...block });
    else joinRuns(walk.pending).forEach((unit) => emit(walk, unit));
  }
  walk.pending = [];
  walk.inText = false;
}

/** Text objects, showing, and (through the shared reducer) every text-state operator. */
function textOperator(walk, token) {
  switch (token.value) {
    case 'BT':
      walk.inText = true;
      walk.textStart = token.start;
      walk.ts = beginText(walk.ts);
      walk.runMin = null;
      walk.runMax = null;
      walk.pending = [];
      walk.blockVertical = false;
      return true;
    case 'ET':
      endTextObject(walk, token);
      return true;
    case 'Tj':
    case "'":
    case '"':
      showText(walk, token);
      return true;
    case 'TJ':
      showTextArray(walk, token);
      return true;
    default:
      walk.ts = applyTextStateOperator(walk.ts, token.value, walk.operands, walk.fonts);
      return true;
  }
}
