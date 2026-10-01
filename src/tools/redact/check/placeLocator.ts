/**
 * RED-25: finds, in a pdf-lib document, the same "places outside page text"
 * that `readSavedFile` reads from pdf.js, each with the edit that removes just
 * it. The text rules (what counts, what its text is) live in `placeText.ts`
 * and are shared; `placeLocator.test.ts` reads one file both ways and fails if
 * the two ever list different places.
 *
 * `locatePlaces` only reads. Nothing changes until a place's `remove()` runs.
 */
import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  PDFString,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
} from '@cantoo/pdf-lib';
import { attachmentName, fieldValueTexts, isNonBlank, sameText } from './placeText.ts';
import { unusedPartsText } from './unusedParts.ts';
import { dropUnreachable } from '../../../editor/adapters/pdf/reachability.js';
import type { PlaceKind, SavedPlace } from './types.ts';

export interface LocatedPlace {
  place: SavedPlace;
  /** XMP is one stream holding many values: it matches a place of its kind
   * whatever text was asked for, and removing it removes them all. */
  matchesAnyText?: boolean;
  /** Removes this place from the document. */
  remove: () => void;
}

const N = PDFName.of;
const MAX_DEPTH = 64;

// ---- small readers -------------------------------------------------------

function textOf(obj: PDFObject | undefined): string | undefined {
  return obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : undefined;
}

function dictAt(ctx: PDFContext, obj: PDFObject | undefined): PDFDict | undefined {
  return obj === undefined ? undefined : ctx.lookupMaybe(obj as PDFRef, PDFDict);
}

function arrayAt(ctx: PDFContext, obj: PDFObject | undefined): PDFArray | undefined {
  return obj === undefined ? undefined : ctx.lookupMaybe(obj as PDFRef, PDFArray);
}

function nameAt(ctx: PDFContext, dict: PDFDict, key: string): string | undefined {
  const value = ctx.lookupMaybe(dict.get(N(key)) as PDFRef, PDFName);
  return value?.decodeText();
}

function numberAt(ctx: PDFContext, dict: PDFDict, key: string): number | undefined {
  return ctx.lookupMaybe(dict.get(N(key)) as PDFRef, PDFNumber)?.asNumber();
}

/** Deletes an object only when it is a reference (an inline object has nothing to delete). */
function drop(ctx: PDFContext, obj: PDFObject | undefined): void {
  if (obj instanceof PDFRef) ctx.delete(obj);
}

// ---- annotations: fields, comments, links --------------------------------

/** A field's /V, looked up the way PDF inherits it: on the widget or an ancestor. */
function inheritedValue(ctx: PDFContext, widget: PDFDict): { holder: PDFDict; value: PDFObject } | undefined {
  let node: PDFDict | undefined = widget;
  for (let depth = 0; node && depth < MAX_DEPTH; depth++) {
    const raw = node.get(N('V'));
    if (raw !== undefined) {
      const value = ctx.lookup(raw);
      return value ? { holder: node, value } : undefined;
    }
    node = dictAt(ctx, node.get(N('Parent')));
  }
  return undefined;
}

function valueToPdfJsShape(ctx: PDFContext, value: PDFObject): unknown {
  if (value instanceof PDFName) return value.decodeText();
  if (value instanceof PDFArray) return value.asArray().map((item) => textOf(ctx.lookup(item)));
  return textOf(value);
}

/** The widgets that show a field: the field itself when merged, else its kids. */
function widgetsOf(ctx: PDFContext, field: PDFDict, depth = 0): PDFDict[] {
  const kids = arrayAt(ctx, field.get(N('Kids')));
  if (!kids || depth > MAX_DEPTH) return nameAt(ctx, field, 'Subtype') === 'Widget' ? [field] : [];
  return kids.asArray().flatMap((kid) => {
    const dict = dictAt(ctx, kid);
    return dict ? widgetsOf(ctx, dict, depth + 1) : [];
  });
}

/** Clears a field's value and the old picture of it, so nothing draws it again. */
function clearField(ctx: PDFContext, holder: PDFDict): void {
  const cleared = textOf(ctx.lookup(holder.get(N('V'))));
  for (const key of ['V', 'I', 'RV']) holder.delete(N(key));
  // The default value goes only when it is the same text; a different one is another place.
  if (cleared !== undefined && textOf(ctx.lookup(holder.get(N('DV')))) === cleared) holder.delete(N('DV'));
  for (const widget of widgetsOf(ctx, holder)) {
    dropAppearance(ctx, widget);
    if (widget.has(N('AS'))) widget.set(N('AS'), N('Off'));
  }
}

/** Deletes an annotation's /AP streams (they hold the drawn text) and the key. */
function dropAppearance(ctx: PDFContext, annot: PDFDict): void {
  const ap = dictAt(ctx, annot.get(N('AP')));
  if (ap) {
    for (const [, entry] of ap.entries()) {
      const resolved = ctx.lookup(entry);
      if (resolved instanceof PDFDict) {
        for (const [, state] of resolved.entries()) drop(ctx, state);
      } else {
        drop(ctx, entry);
      }
    }
  }
  drop(ctx, annot.get(N('AP')));
  annot.delete(N('AP'));
}

function removeFileSpec(ctx: PDFContext, spec: PDFObject | undefined): void {
  const dict = dictAt(ctx, spec);
  const embedded = dict && dictAt(ctx, dict.get(N('EF')));
  if (embedded) for (const [, stream] of embedded.entries()) drop(ctx, stream);
  drop(ctx, spec);
}

/** Takes an annotation off its page and deletes what it owns: its pictures, a
 * popup, and the file a FileAttachment carries. */
function removeAnnotation(ctx: PDFContext, annots: PDFArray, entry: PDFObject, dict: PDFDict): void {
  const take = (target: PDFObject): void => {
    const index = annots.indexOf(target);
    if (index !== undefined) annots.remove(index);
  };
  const popup = dict.get(N('Popup'));
  if (popup instanceof PDFRef) {
    const popupDict = dictAt(ctx, popup);
    if (popupDict) dropAppearance(ctx, popupDict);
    take(popup);
    ctx.delete(popup);
  }
  dropAppearance(ctx, dict);
  removeFileSpec(ctx, dict.get(N('FS')));
  take(entry);
  drop(ctx, entry);
}

function uriOf(ctx: PDFContext, dict: PDFDict): string | undefined {
  const action = dictAt(ctx, dict.get(N('A')));
  return action ? textOf(ctx.lookup(action.get(N('URI')))) : undefined;
}

function annotationPlaces(ctx: PDFContext, annots: PDFArray, pageIndex: number): LocatedPlace[] {
  const places: LocatedPlace[] = [];
  for (const entry of annots.asArray()) {
    const dict = dictAt(ctx, entry);
    if (!dict) continue;
    const isWidget = nameAt(ctx, dict, 'Subtype') === 'Widget';

    const inherited = isWidget ? inheritedValue(ctx, dict) : undefined;
    if (inherited) {
      for (const text of fieldValueTexts(valueToPdfJsShape(ctx, inherited.value))) {
        places.push({ place: { kind: 'field', text, pageIndex }, remove: () => clearField(ctx, inherited.holder) });
      }
    }

    // A widget's /Contents is its own note; the annotation is the field, so only the note goes.
    const removeNote = isWidget
      ? () => void dict.delete(N('Contents'))
      : () => removeAnnotation(ctx, annots, entry, dict);
    const contents = textOf(ctx.lookup(dict.get(N('Contents'))));
    if (isNonBlank(contents)) {
      places.push({ place: { kind: 'comment', text: contents, pageIndex }, remove: removeNote });
    }
    // A widget's /T is the field's name: readSavedFile reports it as not removable.
    const title = isWidget ? undefined : textOf(ctx.lookup(dict.get(N('T'))));
    if (isNonBlank(title)) {
      places.push({ place: { kind: 'comment', text: title, pageIndex }, remove: removeNote });
    }

    if (nameAt(ctx, dict, 'Subtype') === 'Link') {
      const url = uriOf(ctx, dict);
      if (isNonBlank(url)) {
        places.push({ place: { kind: 'link', text: url, pageIndex }, remove: () => removeAnnotation(ctx, annots, entry, dict) });
      }
    }
  }
  return places;
}

// ---- bookmarks -----------------------------------------------------------

function outlineChildren(ctx: PDFContext, parent: PDFDict): Array<{ ref: PDFObject; dict: PDFDict }> {
  const children: Array<{ ref: PDFObject; dict: PDFDict }> = [];
  const seen = new Set<PDFObject>();
  let ref = parent.get(N('First'));
  while (ref !== undefined && !seen.has(ref) && children.length < 100_000) {
    seen.add(ref);
    const dict = dictAt(ctx, ref);
    if (!dict) break;
    children.push({ ref, dict });
    ref = dict.get(N('Next'));
  }
  return children;
}

/** Deletes an outline item and all it contains. Not the destinations it points at. */
function deleteOutlineItem(ctx: PDFContext, ref: PDFObject, dict: PDFDict, depth = 0): void {
  if (depth < MAX_DEPTH && dict.has(N('First'))) {
    for (const child of outlineChildren(ctx, dict)) deleteOutlineItem(ctx, child.ref, child.dict, depth + 1);
  }
  drop(ctx, ref);
}

/** Unlinks an item from its siblings and parent, fixes the parents' counts, deletes it. */
function removeOutlineItem(ctx: PDFContext, ref: PDFObject, dict: PDFDict): void {
  const parent = dictAt(ctx, dict.get(N('Parent')));
  const prev = dictAt(ctx, dict.get(N('Prev')));
  const next = dictAt(ctx, dict.get(N('Next')));
  const prevRef = dict.get(N('Prev'));
  const nextRef = dict.get(N('Next'));

  if (prev) {
    if (nextRef) prev.set(N('Next'), nextRef);
    else prev.delete(N('Next'));
  } else if (parent) {
    if (nextRef) parent.set(N('First'), nextRef);
    else parent.delete(N('First'));
  }
  if (next) {
    if (prevRef) next.set(N('Prev'), prevRef);
    else next.delete(N('Prev'));
  } else if (parent) {
    if (prevRef) parent.set(N('Last'), prevRef);
    else parent.delete(N('Last'));
  }
  deleteOutlineItem(ctx, ref, dict);

  // /Count is the number of items shown below, and negative when closed.
  let node = parent;
  for (let depth = 0; node && depth < MAX_DEPTH; depth++) {
    const children = outlineChildren(ctx, node);
    const wasClosed = (numberAt(ctx, node, 'Count') ?? 0) < 0;
    if (children.length === 0) {
      for (const key of ['First', 'Last', 'Count']) node.delete(N(key));
    } else {
      const shown = children.reduce((sum, child) => sum + 1 + Math.max(numberAt(ctx, child.dict, 'Count') ?? 0, 0), 0);
      node.set(N('Count'), PDFNumber.of(wasClosed ? -shown : shown));
    }
    node = dictAt(ctx, node.get(N('Parent')));
  }
}

function bookmarkPlaces(ctx: PDFContext, catalog: PDFDict): LocatedPlace[] {
  const root = dictAt(ctx, catalog.get(N('Outlines')));
  if (!root) return [];
  const places: LocatedPlace[] = [];
  const visit = (parent: PDFDict, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const { ref, dict } of outlineChildren(ctx, parent)) {
      const title = textOf(ctx.lookup(dict.get(N('Title'))));
      if (isNonBlank(title)) {
        places.push({ place: { kind: 'bookmark', text: title }, remove: () => removeOutlineItem(ctx, ref, dict) });
      }
      // The reader descends only into an item that names both ends of its children.
      if (dict.has(N('First')) && dict.has(N('Last'))) visit(dict, depth + 1);
    }
  };
  visit(root, 0);
  return places;
}

// ---- document information, XMP -------------------------------------------

const INFO_KEYS: Array<[string, PlaceKind]> = [
  ['Title', 'title'],
  ['Author', 'author'],
  ['Subject', 'subject'],
  ['Keywords', 'keywords'],
];

function metadataPlaces(ctx: PDFContext, catalog: PDFDict): LocatedPlace[] {
  const places: LocatedPlace[] = [];
  const info = dictAt(ctx, ctx.trailerInfo.Info);
  if (info) {
    for (const [key, kind] of INFO_KEYS) {
      const text = textOf(ctx.lookup(info.get(N(key))));
      if (isNonBlank(text)) places.push({ place: { kind, text }, remove: () => void info.delete(N(key)) });
    }
  }
  const xmp = catalog.get(N('Metadata'));
  if (ctx.lookup(xmp) instanceof PDFStream) {
    places.push({
      place: { kind: 'metadata', text: '' },
      matchesAnyText: true,
      remove: () => {
        drop(ctx, xmp);
        catalog.delete(N('Metadata'));
      },
    });
  }
  return places;
}

// ---- attachments ---------------------------------------------------------

interface NameTreeEntry {
  names: PDFArray;
  index: number;
  key: PDFObject;
  value: PDFObject;
}

function nameTreeEntries(ctx: PDFContext, node: PDFDict, depth = 0): NameTreeEntry[] {
  if (depth > MAX_DEPTH) return [];
  const entries: NameTreeEntry[] = [];
  const names = arrayAt(ctx, node.get(N('Names')));
  if (names) {
    for (let index = 0; index + 1 < names.size(); index += 2) {
      entries.push({ names, index, key: names.get(index), value: names.get(index + 1) });
    }
  }
  const kids = arrayAt(ctx, node.get(N('Kids')));
  if (kids) {
    for (const kid of kids.asArray()) {
      const dict = dictAt(ctx, kid);
      if (dict) entries.push(...nameTreeEntries(ctx, dict, depth + 1));
    }
  }
  return entries;
}

/** Drops emptied branches and rewrites each branch's /Limits to the keys it still holds. */
function tidyNameTree(ctx: PDFContext, node: PDFDict, isRoot: boolean, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  const kids = arrayAt(ctx, node.get(N('Kids')));
  if (kids) {
    for (let i = kids.size() - 1; i >= 0; i--) {
      const kid = kids.get(i);
      const dict = dictAt(ctx, kid);
      if (!dict || !tidyNameTree(ctx, dict, false, depth + 1)) {
        kids.remove(i);
        drop(ctx, kid);
      }
    }
  }
  const entries = nameTreeEntries(ctx, node);
  if (entries.length === 0) return false;
  if (!isRoot) {
    node.set(N('Limits'), ctx.obj([entries[0].key, entries[entries.length - 1].key]));
  }
  return true;
}

function attachmentPlaces(ctx: PDFContext, catalog: PDFDict): LocatedPlace[] {
  const names = dictAt(ctx, catalog.get(N('Names')));
  const tree = names && dictAt(ctx, names.get(N('EmbeddedFiles')));
  if (!names || !tree) return [];
  const places: LocatedPlace[] = [];
  for (const entry of nameTreeEntries(ctx, tree)) {
    const spec = dictAt(ctx, entry.value);
    if (!spec) continue;
    let raw: string | undefined;
    for (const key of ['UF', 'F', 'Unix', 'Mac', 'DOS']) {
      if (spec.has(N(key))) {
        raw = textOf(ctx.lookup(spec.get(N(key))));
        break;
      }
    }
    const text = attachmentName(raw ?? '');
    if (!isNonBlank(text)) continue;
    places.push({
      place: { kind: 'attachment', text },
      remove: () => {
        const at = entry.names.indexOf(entry.key);
        if (at === undefined) return;
        entry.names.remove(at + 1);
        entry.names.remove(at);
        removeFileSpec(ctx, entry.value);
        if (!tidyNameTree(ctx, tree, true)) {
          drop(ctx, names.get(N('EmbeddedFiles')));
          names.delete(N('EmbeddedFiles'));
        }
      },
    });
  }
  return places;
}

// ---- parts no page shows -------------------------------------------------

/** RED-49: every object nothing reaches is one place, whose text is all that
 * can be read in them. Removing it drops them all, and it matches whatever
 * text was asked for, like XMP, because the text is the whole lot. */
function unusedPlaces(doc: PDFDocument): LocatedPlace[] {
  const text = unusedPartsText(doc);
  if (!isNonBlank(text)) return [];
  return [{ place: { kind: 'unused', text, removable: true }, matchesAnyText: true, remove: () => void dropUnreachable(doc) }];
}

// ---- the whole file ------------------------------------------------------

/** Every place `readSavedFile` reports, each with its removal. Form fields come
 * in annotation order here, and pdf.js lists them after the rest of a page's
 * annotations, so match a place by `isSamePlace`, never by position. */
export function locatePlaces(doc: PDFDocument): LocatedPlace[] {
  const ctx = doc.context;
  const places: LocatedPlace[] = [];
  doc.getPages().forEach((page, pageIndex) => {
    const annots = page.node.Annots();
    if (annots) places.push(...annotationPlaces(ctx, annots, pageIndex));
  });
  places.push(...bookmarkPlaces(ctx, doc.catalog));
  places.push(...metadataPlaces(ctx, doc.catalog));
  places.push(...attachmentPlaces(ctx, doc.catalog));
  places.push(...unusedPlaces(doc));
  return places;
}

/** Whether a located place is the one a `SavedPlace` read back from the file names. */
export function isSamePlace(located: LocatedPlace, wanted: SavedPlace): boolean {
  return (
    located.place.kind === wanted.kind &&
    located.place.pageIndex === wanted.pageIndex &&
    (located.matchesAnyText === true || sameText(located.place.text, wanted.text))
  );
}
