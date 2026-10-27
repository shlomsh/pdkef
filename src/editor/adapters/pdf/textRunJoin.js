/** Baseline drift allowed between joined show ops, as a fraction of the font size. */
const JOIN_BASELINE_TOLERANCE = 0.1;
/** Gap allowed between one op's end and the next op's start, as a fraction of the font size. */
const JOIN_GAP_TOLERANCE = 0.3;

const unionBox = (a, b) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/** The byte range of an inline BDC dict that may carry the text it marks, else null. */
export function textDictRange(token) {
  const carries = token?.type === 'dict'
    && token.value.some((t) => t.type === 'name' && ['ActualText', 'Alt', 'E'].includes(t.value));
  return carries ? { start: token.start, end: token.end } : null;
}

/** The distinct dict ranges among several units' `strip` lists. */
export const unionStrips = (lists) => {
  const byStart = new Map();
  for (const range of lists.flat().filter(Boolean)) byStart.set(range.start, range);
  return [...byStart.values()];
};

/**
 * Joins the show ops of one text object that read as a single run (RED-54): a producer that places
 * one glyph per op (`Tm (x) Tj`) would otherwise offer one Delete target per character. Ops join
 * when they share a font and size, sit on one baseline, and the next starts within a small gap of
 * where the previous ended (plain distance, so visual-order RTL glyphs placed left to right join).
 * A joined unit carries `parts`, the replacement of each op, so a delete keeps the positioning
 * operators between them. A lone op keeps its own `replacement` and has no `parts`.
 *
 * @param {Array<{run: {fontKey, size, scale, from: number[], to: number[]}}>} ops units in stream order
 */
export function joinRuns(ops) {
  const groups = [];
  for (const op of ops) {
    const group = groups[groups.length - 1];
    const prev = group?.[group.length - 1];
    const { run } = op;
    const unit = run.size * run.scale;
    const joins = prev
      && prev.run.fontKey === run.fontKey
      && prev.run.size === run.size
      && Math.abs(run.from[1] - prev.run.from[1]) <= JOIN_BASELINE_TOLERANCE * unit
      && Math.hypot(run.from[0] - prev.run.to[0], run.from[1] - prev.run.to[1]) <= JOIN_GAP_TOLERANCE * unit;
    if (joins) group.push(op);
    else groups.push([op]);
  }
  return groups.map((group) => {
    const withoutRun = ({ run, ...unit }) => unit;
    if (group.length === 1) return withoutRun(group[0]);
    const { replacement, ...first } = withoutRun(group[0]);
    const strips = unionStrips(group.map((op) => op.strip));
    return {
      ...first,
      ...(strips.length ? { strip: strips } : {}),
      bbox: group.reduce((box, op) => unionBox(box, op.bbox), group[0].bbox),
      end: group[group.length - 1].end,
      parts: group.map((op) => ({ start: op.start, end: op.end, replacement: op.replacement })),
    };
  });
}
