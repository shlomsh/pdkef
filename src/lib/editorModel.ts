// Shared element model for the Sign/Redact canvas editors, expressed as a
// discriminated union over the flat `type` field. This is the first TypeScript
// foothold (backlog E4.1) toward a framework-agnostic editor core (E4.2) and a
// per-type registry (E4.3). Nothing here runs — it's a types-only description of
// the plain objects the editors already produce and consume.
//
// Field shapes are read from reality, not invented:
//   - creation:  src/lib/useWorkspaceGestures.js (text/symbol/line/shape/whiteout
//                factories) and PdfSignTool.jsx `placeSignatureAt` (signature).
//   - rendering: src/components/SignTool/nodes/*.jsx.
//   - export:    src/lib/sign.js `signPdf` (the bake-out reads these fields).
//   - geometry:  DraggableWrapper.jsx drag/resize (left/top/width/height percents,
//                x1..y2 line endpoints, aspectRatio, fontSize).
//
// Repo conventions this encodes (see CLAUDE.md / project memory):
//   - `type` is the geometry discriminator directly; there is no nested "shape"
//     wrapper (the old shape/shapeType split is gone).
//   - box-like elements carry a bbox (top/left/width/height as percentages of the
//     page wrapper); a line carries ordered endpoints (x1,y1 -> x2,y2), also in
//     page-relative percentages, and no bbox.

/** The set of element kinds the editor knows how to place, render, and bake. */
export type ElementType =
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'symbol'
  | 'signature'
  | 'whiteout';

/** Symbol glyphs (SymbolNode.jsx). `symbolType` is a legacy alias still tolerated. */
export type SymbolMark = 'check' | 'x' | 'dot';

/** Text flow direction; `null`/absent means "auto-detect from content" (sign.js). */
export type TextDirection = 'ltr' | 'rtl';

/**
 * Fields common to every element. Percentages are relative to the page wrapper
 * the element lives in; `pageIndex` selects which PDF page it's baked onto.
 */
export interface ElementBase {
  id: string;
  type: ElementType;
  pageIndex: number;
  /** Hex color (e.g. `#1463ff`); each variant has its own default fallback. */
  color?: string;
}

/**
 * Axis-aligned bounding box shared by every non-line element. All four values
 * are percentages of the page wrapper (width for left/width, height for
 * top/height). For RTL text, `left` is the anchored *right* edge — see
 * DraggableWrapper.jsx's positioning comment — but the field name is unchanged.
 */
export interface BoxGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A text box. Width/height are intrinsic (CSS `auto`), so they aren't stored. */
export interface TextElement extends ElementBase {
  type: 'text';
  left: number;
  top: number;
  /** Current text content; the source of truth for effective direction. */
  text: string;
  /** Font size in PDF points. */
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  /** Explicit direction seed; absent lets sign.js auto-detect from `text`. */
  textDirection?: TextDirection;
  /** Transient: focus the textarea on next render, then cleared by TextNode. */
  autoFocus?: boolean;
  /** Height/width ratio used during resize (falls back to ASPECT_RATIO_TEXT). */
  aspectRatio?: number;
}

/** A stroked rectangle outline. */
export interface RectangleElement extends ElementBase, BoxGeometry {
  type: 'rectangle';
  strokeWidth?: number;
  aspectRatio?: number;
}

/** A stroked ellipse outline. */
export interface EllipseElement extends ElementBase, BoxGeometry {
  type: 'ellipse';
  strokeWidth?: number;
  aspectRatio?: number;
}

/**
 * A straight line defined by two ordered endpoints (percentages of the page
 * wrapper). Lines carry no bbox — they render and bake straight from x1..y2.
 */
export interface LineElement extends ElementBase {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth?: number;
}

/** A check / cross / dot glyph placed as a square-ish box. */
export interface SymbolElement extends ElementBase, BoxGeometry {
  type: 'symbol';
  /** Preferred glyph field. */
  mark?: SymbolMark;
  /** Legacy glyph field still read by SymbolNode.jsx (`cross` -> `x`). */
  symbolType?: string;
  aspectRatio?: number;
}

/** A rasterized (drawn/typed/uploaded) signature image. */
export interface SignatureElement extends ElementBase, BoxGeometry {
  type: 'signature';
  /** PNG data URL of the signature ink (recolored on export if tinted). */
  dataUrl: string;
  aspectRatio?: number;
}

/** An opaque fill box that covers underlying content (Redact reuses this). */
export interface WhiteoutElement extends ElementBase, BoxGeometry {
  type: 'whiteout';
}

/**
 * The full editor element model: a discriminated union keyed on `type`. Narrow
 * with `el.type === '...'` to reach a variant's specific fields.
 */
export type EditorElement =
  | TextElement
  | RectangleElement
  | EllipseElement
  | LineElement
  | SymbolElement
  | SignatureElement
  | WhiteoutElement;
