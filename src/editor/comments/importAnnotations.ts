/**
 * Read standard PDF markup back as editable elements (docs/sign-comments-model.md, round-trip contract).
 *
 * Every `/Highlight` and every non-reply `/Text` becomes an element and leaves the PDF, so it is never
 * drawn twice. Two layers: `annotationsToElements` is pure over plain records, and
 * `importStandardAnnotations` is the thin pdf-lib IO around it. Other annotations are never touched.
 */
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from '@cantoo/pdf-lib';
import type { PDFObject } from '@cantoo/pdf-lib';
import { pdfPointToPagePercent, type PageGeometry } from '../geometry/coords.ts';
import type { CommentElement, EditorElement, HighlightBand, HighlightElement } from '../model/editorModel.ts';
import { DEFAULT_HIGHLIGHT_COLOR } from '../model/highlightColors.ts';
import { openPdfDoc } from '#lib/pdf/openPdfDoc.ts';
import { uniqueId } from '../model/ids.ts';
import { pageGeometryFromPdfLibPage } from '../adapters/pdf/pdfLibGeometry.ts';
import { pinBox } from './pinBox.ts';


type Box = { left: number; top: number; width: number; height: number };

/** One annotation as read from the PDF. `ref`, `irt`, `popup` and `parent` are opaque and compared by identity. */
export interface RawAnnotation {
  ref: unknown;
  subtype: string;
  rect: number[];
  quadPoints?: number[];
  /** Undefined when /C is absent, [] when it is empty (transparent). */
  color?: number[];
  contents?: string;
  nm?: string;
  m?: string;
  irt?: unknown;
  rt?: string;
  popup?: unknown;
  parent?: unknown;
}

export interface RawPage { pageIndex: number; geometry: PageGeometry; annots: RawAnnotation[] }

/** `D:YYYYMMDDHHmmSS` with an optional `Z` or `+HH'mm'` zone, as epoch ms. Undefined when unparseable. */
export function parsePdfDate(value: string | undefined): number | undefined {
  const match = value?.match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:Z|([+-])(\d{2})(?:'?(\d{2})'?)?)?/);
  if (!match) return undefined;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00', sign, oh = '00', om = '00'] = match;
  const offsetMin = sign ? (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om)) : 0;
  const time = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - offsetMin * 60000;
  return Number.isFinite(time) ? time : undefined;
}

const isBlank = (text: string | undefined) => !text || !text.trim();
const bare = (name: string | undefined) => (name ?? '').replace(/^\//, '');

function toHex(color: number[] | undefined): string {
  if (!color) return DEFAULT_HIGHLIGHT_COLOR;
  let rgb: number[] | null = null;
  if (color.length === 1) rgb = [color[0], color[0], color[0]];
  else if (color.length === 3) rgb = color;
  else if (color.length === 4) rgb = [0, 1, 2].map((i) => (1 - color[i]) * (1 - color[3]));
  if (!rgb) return DEFAULT_HIGHLIGHT_COLOR;
  return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** The quads' rects in page percent, their union, and each rect in percent of that union. Null without a usable quad. */
function bandsOf(quadPoints: number[] | undefined, geometry: PageGeometry): { box: Box; bands: HighlightBand[] } | null {
  const rects: Box[] = [];
  for (let i = 0; quadPoints && i + 8 <= quadPoints.length; i += 8) {
    const points = [0, 2, 4, 6].map((o) => pdfPointToPagePercent({ x: quadPoints[i + o], y: quadPoints[i + o + 1] }, geometry));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    rects.push({ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top });
  }
  if (!rects.length || !rects.every((r) => [r.left, r.top, r.width, r.height].every(Number.isFinite))) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  const box = { left, top, width: right - left, height: bottom - top };
  const w = box.width || 1;
  const h = box.height || 1;
  const bands = rects.map((r) => ({
    left: ((r.left - left) / w) * 100, top: ((r.top - top) / h) * 100, width: (r.width / w) * 100, height: (r.height / h) * 100,
  }));
  return { box, bands };
}

/**
 * Plain annotation records to elements, plus the annotations that must leave the PDF. Pure.
 * Elements come in page order then annotation order, a comment right after its highlight.
 */
export function annotationsToElements(
  pages: RawPage[],
  newId: () => string,
): { elements: EditorElement[]; remove: Set<RawAnnotation> } {
  const elements: EditorElement[] = [];
  const remove = new Set<RawAnnotation>();
  const used = new Set<string>();
  const takeId = (nm: string | undefined) => {
    const id = nm && !used.has(nm) ? nm : newId();
    used.add(id);
    return id;
  };

  for (const page of pages) {
    const removedRefs = new Set<unknown>();
    const removedPopups = new Set<unknown>();
    for (const a of page.annots) {
      const made = elementsOf(a, page, takeId);
      if (!made) continue;
      elements.push(...made);
      remove.add(a);
      removedRefs.add(a.ref);
      if (a.popup) removedPopups.add(a.popup);
    }
    for (const a of page.annots) {
      if (isLeftover(a, removedRefs, removedPopups)) remove.add(a);
    }
  }
  return { elements, remove };
}

type TakeId = (nm: string | undefined) => string;

/** The elements one annotation becomes, or null when PDkef leaves it in the PDF. */
function elementsOf(a: RawAnnotation, page: RawPage, takeId: TakeId): EditorElement[] | null {
  if (a.irt) return null;
  const subtype = bare(a.subtype);
  if (subtype === 'Highlight') return highlightElements(a, page, takeId);
  if (subtype === 'Text') return noteElement(a, page, takeId);
  return null;
}

/** A colored `/Highlight` is a highlight (plus its comment); a transparent one with text is a passage comment. */
function highlightElements(a: RawAnnotation, { pageIndex, geometry }: RawPage, takeId: TakeId): EditorElement[] | null {
  const geo = bandsOf(a.quadPoints, geometry);
  if (!geo) return null;
  const text = isBlank(a.contents) ? undefined : (a.contents as string);
  const commentedAt = parsePdfDate(a.m);
  if (a.color && a.color.length === 0) {
    if (!text) return null;
    return [{
      id: takeId(a.nm), type: 'comment', pageIndex, ...geo.box, comment: text, commentedAt,
      anchor: { kind: 'passage', bands: geo.bands },
    } satisfies CommentElement];
  }
  const id = takeId(a.nm);
  const highlight: HighlightElement = { id, type: 'highlight', pageIndex, ...geo.box, color: toHex(a.color), bands: geo.bands };
  if (!text) return [highlight];
  const commentId = takeId(`${id}-comment`);
  return [highlight, {
    id: commentId, type: 'comment', pageIndex, ...geo.box, comment: text, commentedAt, anchor: { kind: 'element', elementId: id },
  } satisfies CommentElement];
}

/** A `/Text` sticky note with text is a pin centered where the note sits. */
function noteElement(a: RawAnnotation, { pageIndex, geometry }: RawPage, takeId: TakeId): EditorElement[] | null {
  if (isBlank(a.contents) || a.rect.length < 4) return null;
  const [x0, y0, x1, y1] = a.rect;
  const center = pdfPointToPagePercent({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, geometry);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  return [{
    id: takeId(a.nm), type: 'comment', pageIndex, ...pinBox(center, geometry), comment: a.contents as string,
    commentedAt: parsePdfDate(a.m), anchor: { kind: 'point' },
  } satisfies CommentElement];
}

/** A popup of a removed annotation, or a legacy PDkef number badge on one: they go with it. */
function isLeftover(a: RawAnnotation, removedRefs: Set<unknown>, removedPopups: Set<unknown>): boolean {
  const subtype = bare(a.subtype);
  if (subtype === 'Popup') return removedRefs.has(a.parent) || removedPopups.has(a.ref);
  return subtype === 'FreeText' && !!a.irt && removedRefs.has(a.irt)
    && bare(a.rt) === 'Group' && /^\d+$/.test((a.contents ?? '').trim());
}

// ---- IO ----

const textOf = (object: PDFObject | undefined): string | undefined =>
  object instanceof PDFString || object instanceof PDFHexString ? object.decodeText() : undefined;

const numbersOf = (object: PDFObject | undefined, lookup: (o: PDFObject) => PDFObject | undefined): number[] | undefined => {
  if (!(object instanceof PDFArray)) return undefined;
  return object.asArray().map((o) => (lookup(o) as PDFNumber | undefined)?.asNumber?.()).filter((n): n is number => typeof n === 'number');
};

/**
 * Import every `/Highlight` and non-reply `/Text` of a PDF as elements and strip them (and their popups and
 * legacy PDkef badges) from the file. Encrypted, unreadable or nothing-to-import: the input comes back untouched.
 */
export async function importStandardAnnotations(bytes: ArrayBuffer): Promise<{ bytes: ArrayBuffer; elements: EditorElement[] }> {
  const untouched = { bytes, elements: [] as EditorElement[] };
  try {
    // No metadata update: the same file always strips to the same bytes, so drafts and recents find it again.
    const { doc } = await openPdfDoc(bytes, { updateMetadata: false });
    const lookup = (o: PDFObject) => doc.context.lookup(o);
    const pdfPages = doc.getPages();
    const rawPages: RawPage[] = [];
    const refOf = new Map<RawAnnotation, PDFRef>();
    pdfPages.forEach((page, pageIndex) => {
      const list = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      const annots: RawAnnotation[] = [];
      for (const entry of list?.asArray() ?? []) {
        const dict = doc.context.lookupMaybe(entry, PDFDict);
        if (!(entry instanceof PDFRef) || !dict) continue;
        const get = (key: string) => dict.get(PDFName.of(key));
        const name = (key: string) => (get(key) instanceof PDFName ? (get(key) as PDFName).decodeText() : undefined);
        const subtype = name('Subtype');
        const rect = numbersOf(get('Rect'), lookup);
        if (!subtype || !rect) continue;
        const color = get('C') === undefined ? undefined : numbersOf(lookup(get('C') as PDFObject), lookup);
        const raw: RawAnnotation = {
          ref: entry, subtype, rect,
          quadPoints: numbersOf(lookup(get('QuadPoints') ?? PDFName.of('')), lookup),
          color,
          contents: textOf(lookup(get('Contents') ?? PDFName.of(''))),
          nm: textOf(lookup(get('NM') ?? PDFName.of(''))),
          m: textOf(lookup(get('M') ?? PDFName.of(''))),
          irt: get('IRT'), rt: name('RT'), popup: get('Popup'), parent: get('Parent'),
        };
        annots.push(raw);
        refOf.set(raw, entry);
      }
      rawPages.push({ pageIndex, geometry: pageGeometryFromPdfLibPage(page), annots });
    });

    const { elements, remove } = annotationsToElements(rawPages, uniqueId);
    if (!remove.size) return untouched;
    const gone = new Set(Array.from(remove, (a) => refOf.get(a)));
    pdfPages.forEach((page) => {
      const list = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      if (!list) return;
      const kept = list.asArray().filter((entry) => !(entry instanceof PDFRef && gone.has(entry)));
      page.node.set(PDFName.of('Annots'), doc.context.obj(kept));
    });
    gone.forEach((ref) => { if (ref) doc.context.delete(ref); });
    const saved = await doc.save();
    return { bytes: saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer, elements };
  } catch {
    // expected: encrypted or unreadable files stay exactly as they were
    return untouched;
  }
}
