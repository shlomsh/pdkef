/**
 * RED-02 contract: find and redact. Everything under `find/` is pure (no DOM,
 * no pdf.js import), so it runs the same in a unit test, a scored corpus in
 * Node, and the island.
 *
 *   pdf.js text items ──buildPageText──▶ PageText ──finder──▶ ranges
 *        ranges + PageText ──matchBoxes──▶ page-percent boxes ──▶ one box per line
 *
 * Finders only propose ranges. The person chooses which matches become
 * redaction boxes; nothing here ever claims a page is "clean".
 */

/** The subset of a pdf.js `TextItem` we read. `TextMarkedContent` entries
 * (no `str`) are skipped by the caller or by `buildPageText`. */
export interface TextItemLike {
  str: string;
  /** [a, b, c, d, e, f]: glyph-space to PDF user space; (e, f) is the baseline start. */
  transform: number[];
  /** Advance width in PDF user space, along the text direction. */
  width: number;
  /** Font size in PDF user space (pdf.js's height), perpendicular to the text direction. */
  height: number;
  dir?: string;
  hasEOL?: boolean;
}

/** One item placed in its page's searchable text. */
export interface PlacedItem {
  /** [start, end) of this item's characters in `PageText.text`. */
  start: number;
  end: number;
  /** The item's own transform, width and height, kept for sub-range boxes. */
  transform: number[];
  width: number;
  height: number;
  /** True when this item's characters run right to left on the page. */
  rtl: boolean;
}

/**
 * A page's text in reading order: items grouped into lines by baseline, each
 * line ordered in its own reading direction (right to left for a line whose
 * letters are mostly right-to-left), lines joined top to bottom with '\n',
 * items on a line joined with ' ' when there is a visible gap between them.
 * Separators belong to no item.
 */
export interface PageText {
  pageIndex: number;
  text: string;
  items: PlacedItem[];
}

/** A half-open character range in `PageText.text`. */
export interface TextRange {
  start: number;
  end: number;
}

/** Proposes ranges in a page's text. Pure; the same text gives the same ranges. */
export type Finder = (text: string) => TextRange[];

/** Page-percent box, top-left origin: the units every Redact element stores. */
export interface PercentBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One proposed match. `boxes` has one box per line the match covers. */
export interface FindMatch {
  /** Stable within one search: `${pageIndex}:${start}`. */
  id: string;
  pageIndex: number;
  start: number;
  end: number;
  /** The matched text as it reads in `PageText.text`. */
  text: string;
  boxes: PercentBox[];
}
