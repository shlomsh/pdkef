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

interface ReadSavedFileOptions {
  /** Pages already known to be pictures (from redaction), zero-based. */
  picturePages: number[];
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

function fieldValuesToText(fieldValue: unknown): string[] {
  if (typeof fieldValue === 'string' && fieldValue.trim() !== '') return [fieldValue];
  if (Array.isArray(fieldValue)) {
    return fieldValue.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  return [];
}

function outlineTitles(items: Array<{ title?: string; items?: unknown[] }>): SavedPlace[] {
  const places: SavedPlace[] = [];
  for (const item of items) {
    if (typeof item.title === 'string' && item.title.trim() !== '') {
      places.push({ kind: 'bookmark', text: item.title });
    }
    if (Array.isArray(item.items) && item.items.length > 0) {
      places.push(...outlineTitles(item.items as Array<{ title?: string; items?: unknown[] }>));
    }
  }
  return places;
}

async function readPlacesForPage(pdfDoc: any, pageIndex: number): Promise<SavedPlace[]> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const annotations = await page.getAnnotations();
  const places: SavedPlace[] = [];
  for (const annotation of annotations) {
    for (const text of fieldValuesToText(annotation.fieldValue)) {
      places.push({ kind: 'field', text, pageIndex });
    }
    const commentText = annotation.contentsObj?.str;
    if (typeof commentText === 'string' && commentText.trim() !== '') {
      places.push({ kind: 'comment', text: commentText, pageIndex });
    }
    const titleText = annotation.titleObj?.str;
    if (typeof titleText === 'string' && titleText.trim() !== '') {
      places.push({ kind: 'comment', text: titleText, pageIndex });
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
    if (typeof value === 'string' && value.trim() !== '') places.push({ kind, text: value });
  }

  // pdf.js's Metadata class has no getAll(); it exposes entries only through
  // its Symbol.iterator (get(name) for one key). Iterate it directly.
  if (metadata && typeof (metadata as any)[Symbol.iterator] === 'function') {
    for (const [, value] of metadata as Iterable<[string, unknown]>) {
      if (typeof value === 'string' && value.trim() !== '') {
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
    if (typeof filename === 'string' && filename.trim() !== '') {
      places.push({ kind: 'attachment', text: filename });
    }
  }
  return { places, attachmentCount: attachments.size };
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

    places.push(...(await readPlacesForPage(doc, pageIndex)));

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

  const picturePages = [...new Set([...options.picturePages, ...detectedPicturePages])].sort((a, b) => a - b);

  return { pages, places, picturePages, attachmentCount };
}
