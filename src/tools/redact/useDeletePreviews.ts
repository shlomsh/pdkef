import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getPdfjs } from '../../editor/adapters/pdf/pdfjsLoader.js';
import { PDFJS_WASM_URL } from '../../lib/pdfjsWasm.js';

const REBUILD_DEBOUNCE_MS = 120;

interface DeleteLikeElement {
  pageIndex: number;
  type: string;
  start?: number;
  end?: number;
  formPath?: string[];
}

/** A span in the page's own content (`formPath` empty) or in a Form XObject stream. */
export interface DeleteSpan {
  start: number;
  end: number;
  formPath: string[];
}

interface DeleteSpanElement extends DeleteLikeElement {
  type: 'delete';
  start: number;
  end: number;
}

function isDeleteSpanElement(element: DeleteLikeElement): element is DeleteSpanElement {
  return element.type === 'delete' && typeof element.start === 'number' && typeof element.end === 'number';
}

/**
 * Groups a Redact document's `delete` elements by page, each page's spans
 * sorted for a stable key. Pure so `useDeletePreviews` can diff pages without
 * caring what order elements were added or undone in.
 *
 * @param {Array<DeleteLikeElement>} elements
 * @returns {Map<number, Array<{start: number, end: number, formPath: string[]}>>}
 */
export function deleteSpansByPage(
  elements: ReadonlyArray<DeleteLikeElement>,
): Map<number, DeleteSpan[]> {
  const byPage = new Map<number, DeleteSpan[]>();
  for (const element of elements) {
    if (!isDeleteSpanElement(element)) continue;
    const spans = byPage.get(element.pageIndex) ?? [];
    spans.push({ start: element.start, end: element.end, formPath: element.formPath ?? [] });
    byPage.set(element.pageIndex, spans);
  }
  for (const spans of byPage.values()) {
    spans.sort((a, b) => a.start - b.start || a.end - b.end || a.formPath.join('/').localeCompare(b.formPath.join('/')));
  }
  return byPage;
}

function spansKey(spans: DeleteSpan[]): string {
  // formPath is part of the key: equal offsets in different streams are different spans.
  return spans.map((s) => `${s.formPath.join('/')}:${s.start}-${s.end}`).join(',');
}

// pdf.js documents carry a runtime `destroy()` that isn't part of
// PDFDocumentProxy's own type (loadPdf.ts's disposePdfHandle hits the same
// gap for the editors' own document handles).
function destroyPreview(proxy: PDFDocumentProxy | undefined) {
  const destroy = Reflect.get(proxy ?? {}, 'destroy');
  if (typeof destroy === 'function') void Promise.resolve(destroy.call(proxy)).catch(() => {});
}

/**
 * Renders each page that has Delete marks from the same rewritten content the
 * download writes (RED-13: "what you see is what you save"), so the deleted
 * text/image disappears on screen instead of only being outlined. A page with
 * no delete elements is absent from the returned map; its canvas keeps
 * rendering the original document as before.
 *
 * The source file is loaded with pdf-lib once per `fileBytes` identity and
 * reused across every page/rebuild. Each page's preview is keyed by its
 * sorted span list, so toggling marks on one page never rebuilds another, and
 * an unrelated re-render (a span list that is `===` to what already built)
 * rebuilds nothing. Rebuilds are debounced so a quick run of toggles collapses
 * into one pdf-lib pass and one pdf.js parse per page.
 *
 * @param {ArrayBuffer|null} fileBytes the loaded file's bytes (same identity
 *   `useDeletableObjects` reads)
 * @param {Array<DeleteLikeElement>} elements the document's current elements
 * @returns {ReadonlyMap<number, PDFDocumentProxy>}
 */
export default function useDeletePreviews(
  fileBytes: ArrayBuffer | null,
  elements: ReadonlyArray<DeleteLikeElement>,
): ReadonlyMap<number, PDFDocumentProxy> {
  const [previews, setPreviews] = useState<ReadonlyMap<number, PDFDocumentProxy>>(new Map());
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  const keysRef = useRef<Map<number, string>>(new Map());
  // The file the keys above were built for. Span keys are only byte offsets,
  // so two files can share one; a new file makes every old key stale.
  const keysFileRef = useRef<ArrayBuffer | null>(null);
  const sourceDocRef = useRef<{ bytes: ArrayBuffer | null; doc: Promise<unknown> | null }>({
    bytes: null,
    doc: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!fileBytes) {
      // File cleared: drop every preview and its pdf.js handle.
      for (const doc of previewsRef.current.values()) destroyPreview(doc);
      keysRef.current = new Map();
      keysFileRef.current = null;
      sourceDocRef.current = { bytes: null, doc: null };
      setPreviews(new Map());
      return undefined;
    }

    if (keysFileRef.current !== fileBytes) {
      keysFileRef.current = fileBytes;
      if (keysRef.current.size > 0) {
        for (const doc of previewsRef.current.values()) destroyPreview(doc);
        keysRef.current = new Map();
        setPreviews(new Map());
      }
    }

    const byPage = deleteSpansByPage(elements);
    const nextKeys = new Map<number, string>();
    for (const [pageIndex, spans] of byPage) nextKeys.set(pageIndex, spansKey(spans));

    const changedPages = [...byPage.keys()].filter(
      (pageIndex) => keysRef.current.get(pageIndex) !== nextKeys.get(pageIndex),
    );
    const removedPages = [...keysRef.current.keys()].filter((pageIndex) => !byPage.has(pageIndex));
    if (changedPages.length === 0 && removedPages.length === 0) return undefined;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;

      // Drop previews for pages that no longer have delete elements.
      if (removedPages.length > 0) {
        setPreviews((current) => {
          const next = new Map(current);
          for (const pageIndex of removedPages) {
            destroyPreview(next.get(pageIndex));
            next.delete(pageIndex);
          }
          return next;
        });
      }
      if (changedPages.length === 0) {
        keysRef.current = nextKeys;
        return;
      }

      if (sourceDocRef.current.bytes !== fileBytes) {
        const load = import('../../editor/adapters/pdf/deleteObjects.js').then(
          async ({ buildDeletePreviewPage }) => {
            const { PDFDocument } = await import('@cantoo/pdf-lib');
            const doc = await PDFDocument.load(new Uint8Array(fileBytes));
            return { doc, buildDeletePreviewPage };
          },
        );
        sourceDocRef.current = { bytes: fileBytes, doc: load };
      }

      try {
        const { doc: sourceDoc, buildDeletePreviewPage } = (await sourceDocRef.current.doc) as {
          doc: import('@cantoo/pdf-lib').PDFDocument;
          buildDeletePreviewPage: (
            doc: import('@cantoo/pdf-lib').PDFDocument,
            pageIndex: number,
            spans: DeleteSpan[],
          ) => Promise<Uint8Array>;
        };
        if (cancelled) return;

        const lib = await getPdfjs();
        const built = await Promise.all(
          changedPages.map(async (pageIndex) => {
            const bytes = await buildDeletePreviewPage(sourceDoc, pageIndex, byPage.get(pageIndex)!);
            const proxy = await lib.getDocument({ data: bytes, wasmUrl: PDFJS_WASM_URL }).promise;
            return [pageIndex, proxy] as const;
          }),
        );
        if (cancelled) {
          // A stale result: nothing else will hold onto these handles.
          for (const [, proxy] of built) destroyPreview(proxy);
          return;
        }

        setPreviews((current) => {
          const next = new Map(current);
          for (const [pageIndex, proxy] of built) {
            destroyPreview(next.get(pageIndex));
            next.set(pageIndex, proxy);
          }
          return next;
        });
        keysRef.current = nextKeys;
      } catch (err) {
        // Same fallback as the rest of Delete: an unreadable preview just
        // means that page keeps showing the (still correct, if less exact)
        // original render, not a broken editor.
        console.error('Could not build a delete preview for this PDF', err);
      }
    }, REBUILD_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elements is destructured through deleteSpansByPage
  }, [fileBytes, elements]);

  useEffect(
    () => () => {
      for (const doc of previewsRef.current.values()) destroyPreview(doc);
    },
    [],
  );

  return previews;
}
