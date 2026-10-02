/**
 * RED-17: reads back the bytes that were saved, everywhere a secret can hide
 * outside page text: form fields, comments, bookmarks, document metadata and
 * attachments (see `SavedPlace` in `types.ts`). Also finds which pages have
 * no text of their own and were painted as a picture (a scan, or a page a
 * box flattened), because those can never be searched.
 *
 * Thin adapter over a pdf.js document the caller already loaded (no
 * `getDocument` call in here); pdf.js is passed in so this file never
 * imports it directly.
 */
import { buildPageText } from '../find/pageText.ts';
import { readTextItems } from '../../../lib/pdfTextItems.ts';
import type { SearchablePage } from '../find/findMatches.ts';
import type { PlaceKind, SavedFile, SavedPlace } from './types.ts';
import { pageGeometryFromPdfJsPage } from '../../../editor/geometry/coords.ts';
import { fieldValueTexts, isNonBlank } from './placeText.ts';
import { unusedPartsText } from './unusedParts.ts';
import { PDFDocument, ParseSpeeds } from '@cantoo/pdf-lib';
import { reportError } from '../../../lib/errorReport.ts';

interface ReadSavedFileOptions {
  /** Pages already known to be pictures (from redaction), zero-based. */
  picturePages: number[];
  /** The saved file's bytes, to look for parts no page shows (RED-49). Read
   * back from `doc` when not given. */
  bytes?: Uint8Array;
}

const IMAGE_OPS_NAMES = [
  'paintImageXObject',
  'paintInlineImageXObject',
  'paintImageXObjectRepeat',
  'paintImageMaskXObject',
  'paintInlineImageXObjectGroup',
  'paintImageMaskXObjectGroup',
  'paintSolidColorImageMask',
] as const;

function outlineTitles(items: Array<{ title?: string; items?: unknown[] }>): SavedPlace[] {
  const places: SavedPlace[] = [];
  for (const item of items) {
    if (isNonBlank(item.title)) {
      places.push({ kind: 'bookmark', text: item.title });
    }
    if (Array.isArray(item.items) && item.items.length > 0) {
      places.push(...outlineTitles(item.items as Array<{ title?: string; items?: unknown[] }>));
    }
  }
  return places;
}

async function readPlacesForPage(pdfjs: any, pdfDoc: any, pageIndex: number): Promise<SavedPlace[]> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const annotations = await page.getAnnotations();
  const places: SavedPlace[] = [];
  for (const annotation of annotations) {
    for (const text of fieldValueTexts(annotation.fieldValue)) {
      places.push({ kind: 'field', text, pageIndex });
    }
    const commentText = annotation.contentsObj?.str;
    if (isNonBlank(commentText)) {
      places.push({ kind: 'comment', text: commentText, pageIndex });
    }
    if (annotation.subtype === 'Widget') {
      // A form field's name (/T) is reported, since it can hold a secret, but
      // it cannot be removed alone: the field would lose its identity.
      if (isNonBlank(annotation.fieldName)) {
        places.push({ kind: 'field', text: annotation.fieldName, pageIndex, removable: false });
      }
    } else {
      const titleText = annotation.titleObj?.str;
      if (isNonBlank(titleText)) {
        places.push({ kind: 'comment', text: titleText, pageIndex });
      }
    }
    if (annotation.annotationType === pdfjs.AnnotationType?.LINK || annotation.subtype === 'Link') {
      const url = annotation.url ?? annotation.unsafeUrl;
      if (isNonBlank(url)) {
        places.push({ kind: 'link', text: url, pageIndex });
      }
    }
  }
  return places;
}

function metadataPlaces(info: Record<string, unknown> | undefined, metadata: unknown): SavedPlace[] {
  const places: SavedPlace[] = [];
  const infoFields: Array<[string, PlaceKind]> = [
    ['Title', 'title'],
    ['Author', 'author'],
    ['Subject', 'subject'],
    ['Keywords', 'keywords'],
  ];
  for (const [field, kind] of infoFields) {
    const value = info?.[field];
    if (isNonBlank(value)) places.push({ kind, text: value });
  }

  // pdf.js's Metadata class has no getAll(); it exposes entries only through
  // its Symbol.iterator (get(name) for one key). Iterate it directly.
  if (metadata && typeof (metadata as any)[Symbol.iterator] === 'function') {
    for (const [, value] of metadata as Iterable<[string, unknown]>) {
      if (isNonBlank(value)) {
        places.push({ kind: 'metadata', text: value });
      }
    }
  }
  return places;
}

async function attachmentPlaces(pdfDoc: any): Promise<{ places: SavedPlace[]; attachmentCount: number }> {
  const attachments = await pdfDoc.getAttachments();
  if (!attachments) return { places: [], attachmentCount: 0 };
  const places: SavedPlace[] = [];
  for (const attachment of attachments.values()) {
    const filename = attachment?.filename;
    if (isNonBlank(filename)) {
      places.push({ kind: 'attachment', text: filename });
    }
  }
  return { places, attachmentCount: attachments.size };
}

/** RED-49: the one 'unused' place, when the file holds readable text in parts
 * no page shows. pdf.js only follows what a page reaches, so this reads the
 * raw objects with pdf-lib, through the same `unusedPartsText` that Remove it's
 * locator uses. A file pdf-lib can't open has nothing to report here. */
async function unusedPlaces(doc: any, bytes: Uint8Array | undefined): Promise<SavedPlace[]> {
  try {
    const data = bytes ?? (await doc.getData());
    const lib = await PDFDocument.load(data, { updateMetadata: false, ignoreEncryption: true, parseSpeed: ParseSpeeds.Fastest });
    const text = unusedPartsText(lib);
    return isNonBlank(text) ? [{ kind: 'unused', text, removable: true }] : [];
  } catch (err) {
    reportError('redact', err, 'read_unused_parts');
    return [];
  }
}

/** True when a page's operator list paints at least one image. */
function pageHasImagePaint(operatorList: { fnArray: number[] }, imageOps: Set<number>): boolean {
  return operatorList.fnArray.some((fn) => imageOps.has(fn));
}

export async function readSavedFile(pdfjs: any, doc: any, options: ReadSavedFileOptions): Promise<SavedFile> {
  const pageCount = doc.numPages;
  const imageOps = new Set<number>(
    IMAGE_OPS_NAMES.map((name) => pdfjs.OPS?.[name]).filter((value): value is number => typeof value === 'number'),
  );

  const pages: SearchablePage[] = [];
  const places: SavedPlace[] = [];
  const detectedPicturePages: number[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = await doc.getPage(pageIndex + 1);
    // readTextItems, never getTextContent(): the latter throws on every iOS
    // browser (pdfTextItems.ts has the story).
    const items = (await readTextItems(page)).filter((item: any) => typeof item.str === 'string') as any[];
    const text = buildPageText(pageIndex, items);
    const geometry = pageGeometryFromPdfJsPage(page);
    pages.push({ text, geometry });

    places.push(...(await readPlacesForPage(pdfjs, doc, pageIndex)));

    if (items.length === 0) {
      const operatorList = await page.getOperatorList();
      if (pageHasImagePaint(operatorList, imageOps)) {
        detectedPicturePages.push(pageIndex);
      }
    }
  }

  const outline = await doc.getOutline();
  if (Array.isArray(outline)) places.push(...outlineTitles(outline));

  const { info, metadata } = await doc.getMetadata();
  places.push(...metadataPlaces(info as Record<string, unknown>, metadata));

  const { places: attachmentSavedPlaces, attachmentCount } = await attachmentPlaces(doc);
  places.push(...attachmentSavedPlaces);
  places.push(...(await unusedPlaces(doc, options.bytes)));

  const picturePages = [...new Set([...options.picturePages, ...detectedPicturePages])].sort((a, b) => a - b);

  return { pages, places, picturePages, attachmentCount };
}
