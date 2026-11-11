// MEM-42: the rating board's flags as one file. Each flag is a nested <svg> cell side by side, with a <view> per
// code, so `sprite.svg#IN` shows exactly that cell and a page with nine flags makes one request. Pure: files in,
// one document out. The cells clip to their own box, and a gap keeps neighbours apart anyway.

export interface FlagFile {
  readonly code: string;
  readonly svg: string;
}

const CELL_W = 513;
const CELL_H = 342;
const GAP = 8;
const CODE = /^[A-Za-z][A-Za-z0-9-]*$/;
const WRAPPER = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/;
const NS = 'http://www.w3.org/2000/svg';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The flag's markup with every id it defines (and each reference to it) carrying the code, so two flags never share one. */
function prefixIds(inner: string, code: string): string {
  const ids = [...new Set([...inner.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))];
  let out = inner;
  for (const id of ids) {
    const e = escapeRe(id);
    out = out
      .replace(new RegExp(`(\\sid=")${e}(")`, 'g'), `$1${code}-${id}$2`)
      .replace(new RegExp(`url\\(#${e}\\)`, 'g'), `url(#${code}-${id})`)
      .replace(new RegExp(`((?:xlink:)?href="#)${e}(")`, 'g'), `$1${code}-${id}$2`);
  }
  return out;
}

function cellOf(file: FlagFile) {
  if (!CODE.test(file.code)) throw new Error(`flag sprite: "${file.code}" is not a usable code`);
  const m = WRAPPER.exec(file.svg);
  if (!m) throw new Error(`flag sprite: ${file.code} is not an svg file`);
  const viewBox = /\sviewBox="([^"]*)"/.exec(m[1])?.[1] ?? `0 0 ${CELL_W} ${CELL_H}`;
  return { code: file.code, viewBox, inner: prefixIds(m[2], file.code) };
}

/**
 * One svg document holding every flag, sorted by code so the same flags always give the same file.
 * @testSeam
 */
export function flagSprite(flags: readonly FlagFile[]): string {
  const sorted = [...new Map(flags.map((f) => [f.code, f])).values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  if (sorted.length === 0) return `<svg xmlns="${NS}"></svg>`;
  const width = sorted.length * CELL_W + (sorted.length - 1) * GAP;
  let body = '';
  sorted.forEach((f, i) => {
    const x = i * (CELL_W + GAP);
    const { code, viewBox, inner } = cellOf(f);
    body += `<svg x="${x}" y="0" width="${CELL_W}" height="${CELL_H}" viewBox="${viewBox}">${inner}</svg><view id="${code}" viewBox="${x} 0 ${CELL_W} ${CELL_H}"/>`;
  });
  return `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${CELL_H}" viewBox="0 0 ${width} ${CELL_H}">${body}</svg>`;
}

export interface PublishedFlagSprite {
  /** Where the sprite is served: its name carries a fingerprint of its bytes, so the file is cached for good. */
  readonly url: string;
  readonly svg: string;
  /** The codes it holds, sorted. */
  readonly codes: readonly string[];
}

// FNV-1a, 64 bit, over the sprite's UTF-8 bytes: a change fingerprint, not a security boundary.
function fingerprint(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0').slice(0, 10);
}

/** The one place the sprite's text and its url come from, so the endpoint and the board cannot disagree (MEM-42). */
export function flagSpriteOf(flags: readonly FlagFile[]): PublishedFlagSprite {
  const svg = flagSprite(flags);
  return { url: `/flags/notes-${fingerprint(svg)}.svg`, svg, codes: [...new Set(flags.map((f) => f.code))].sort() };
}
