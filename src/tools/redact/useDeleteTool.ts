import { useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { uniqueId } from '../../editor/model/ids.ts';
import useDeletableObjects from './useDeletableObjects.js';
import useDeletePreviews from './useDeletePreviews.ts';
import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';
import { snapshotRect, type Lift } from './DeleteLift.tsx';
import type { RedactCommands } from './useRedactCommands.ts';
import { deletedSummary } from './deleteMarquee.ts';
import type { RedactElement } from './redactElements.ts';
import { EVERY_PAGE_MESSAGE, restOfImage, sharedImageMessage } from './sameImage.ts';

// See redactElements.ts's own comment on RedactElement for why the
// island's element type, not RedactElement, is what this hook takes.
type RedactElementLike = RedactElement;

export interface UseDeleteToolDeps {
  elements: readonly RedactElementLike[];
  file: File | null;
  fileBytes: ArrayBuffer | null;
  pdfDocument: PDFDocumentProxy | null;
  pageWrapperRefs: { current: (HTMLDivElement | null)[] };
  add: RedactCommands<RedactElementLike>['add'];
  announce: (message: string) => void;
  disarmTool: () => void;
}

export interface UseDeleteToolResult {
  deletableObjects: DeletablePdfObject[];
  markedForDeletionIds: ReadonlySet<string>;
  deletePreviews: ReadonlyMap<number, PDFDocumentProxy>;
  lifts: Lift[];
  finishLift: (id: string) => void;
  clearLifts: () => void;
  markObject: (object: DeletablePdfObject) => void;
  markObjects: (objects: readonly DeletablePdfObject[], options?: { summary?: string }) => void;
}

/**
 * RED-14: the Delete tool's own state - what it can offer to click on, what's
 * already queued, the "what you see is what you save" previews (RED-13), and
 * the lift-off animation for the object just marked. Moved out of the island
 * wholesale; PdfRedactTool.tsx still renders DeleteLift/DeletableObjectOverlay,
 * reading everything else from here.
 */
export default function useDeleteTool(deps: UseDeleteToolDeps): UseDeleteToolResult {
  const { elements, file, fileBytes, pdfDocument, pageWrapperRefs, add, announce, disarmTool } = deps;

  // What the Delete tool can offer to click on: images and text runs the PDF
  // itself stores as a single object, found by parsing the source file's own
  // content streams (not what's on the page after any edits this session has
  // queued - the source never changes until export, only `elements` does).
  const deletableObjects: DeletablePdfObject[] = useDeletableObjects(file, fileBytes);
  // RED-13: a page with Delete marks renders from the same rewritten content
  // the download writes, so the deleted text/image disappears on screen
  // rather than only being outlined.
  const deletePreviews = useDeletePreviews(fileBytes, elements);
  const [lifts, setLifts] = useState<Lift[]>([]);
  const markedForDeletionIds = useMemo(
    () => new Set<string>(elements.flatMap((element) => (
      element.type === 'delete' && typeof element.sourceObjectId === 'string'
        ? [element.sourceObjectId]
        : []
    ))),
    [elements],
  );

  // Delete tool: clicking a highlighted object queues it for removal by
  // recording the byte span pdfObjects.js found for it. A marked object
  // renders no hover target of its own (DeletableObjectOverlay filters it
  // out), so this is only ever reached for an object not yet queued.
  const markObjects = (objects: readonly DeletablePdfObject[], options: { summary?: string } = {}) => {
    if (objects.length === 0) return;
    // RED-13: each object lifts off the page once the page is drawn without it.
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const newLifts: Lift[] = [];
    const created: RedactElementLike[] = objects.map((object) => {
      const id = uniqueId();
      const image = reducedMotion ? null : snapshotRect(pageWrapperRefs.current[object.pageIndex]?.querySelector('canvas'), object.rect);
      if (image) {
        newLifts.push({
          id, pageIndex: object.pageIndex, rect: object.rect, image,
          paintedFrom: deletePreviews.get(object.pageIndex) ?? pdfDocument,
        });
      }
      return {
        id,
        pageIndex: object.pageIndex,
        type: 'delete',
        sourceObjectId: object.id,
        kind: object.kind,
        preview: object.preview,
        left: object.rect.left,
        top: object.rect.top,
        width: object.rect.width,
        height: object.rect.height,
        start: object.start,
        end: object.end,
      };
    });
    if (newLifts.length) setLifts((prev) => [...prev, ...newLifts]);
    // RED-33: one drag is one history entry, so one undo restores them all.
    const summary = options.summary ?? deletedSummary(objects);
    // RED-26: one image that other pages also draw offers "Every page" on the
    // chip, which says so; the history entry keeps the plain summary.
    let chipMessage: string | undefined;
    let undoExtra: { label: string; onSelect: () => void } | undefined;
    if (!options.summary && objects.length === 1) {
      const { rest, otherPages } = restOfImage(deletableObjects, markedForDeletionIds, objects[0]);
      if (otherPages > 0) {
        chipMessage = sharedImageMessage(otherPages);
        // Through a ref: this runs on a later render, and `add` must see that render's elements.
        undoExtra = { label: 'Every page', onSelect: () => latest.current(rest, { summary: EVERY_PAGE_MESSAGE }) };
      }
    }
    add(created, { type: 'ADD_DELETE', description: summary, undoChip: true, undoExtra, chipMessage });
    announce(`${chipMessage ?? summary}.`);
    // Marking is this tool's placement, so it spends the arming.
    disarmTool();
  };
  const latest = useRef(markObjects);
  latest.current = markObjects;
  const markObject = (object: DeletablePdfObject) => markObjects([object]);

  const finishLift = (id: string) => setLifts((prev) => prev.filter((lift) => lift.id !== id));
  // The island calls this on file load, where it used to call setLifts([])
  // directly: a lift from the last file must never show over this one.
  const clearLifts = () => setLifts([]);

  return { deletableObjects, markedForDeletionIds, deletePreviews, lifts, finishLift, clearLifts, markObject, markObjects };
}
