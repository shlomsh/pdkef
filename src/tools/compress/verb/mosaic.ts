export type Tone = 'skyHigh' | 'skyLow' | 'hill' | 'ground' | 'sun';
export type Run = { x: number; y: number; w: number };

/** The smooth photo's scene (docs/tool-hero-sketch/compress-verbs.html) sampled at one point. */
function scene(u: number, v: number): Tone {
  if (Math.hypot((u - 0.72) * 1.4, v - 0.28) < 0.16) return 'sun';
  const t = 0.5 + ((u - 0.5) * 1.4 * 0.4226 + (v - 0.5) * 0.906) / 1.498;
  if (t >= 0.74) return 'ground';
  if (t >= 0.52) return 'hill';
  return v < 0.5 ? 'skyHigh' : 'skyLow';
}

/**
 * The scene as a cols x rows grid of flat-colour cells, horizontal runs of one tone merged,
 * grouped by tone so the SVG paints each group with one class.
 */
export function mosaicRuns(cols: number, rows: number): Record<Tone, Run[]> {
  const out: Record<Tone, Run[]> = { skyHigh: [], skyLow: [], hill: [], ground: [], sun: [] };
  for (let r = 0; r < rows; r++) {
    let start = 0;
    let tone = scene(0.5 / cols, (r + 0.5) / rows);
    for (let c = 1; c <= cols; c++) {
      const next = c < cols ? scene((c + 0.5) / cols, (r + 0.5) / rows) : null;
      if (next !== tone) {
        out[tone].push({ x: start, y: r, w: c - start });
        start = c;
        if (next) tone = next;
      }
    }
  }
  return out;
}
