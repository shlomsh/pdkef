import type { EditorElement, ElementType } from '../model/editorModel.ts';
import type { DocumentStyle } from '../model/documentStyle.ts';
import {
  isActionHistoryEntry, revertHistoryEntries, type ActionHistoryEntry, type HistoryElement,
} from '../model/actionHistory.ts';
import { MAX_HISTORY_DEPTH } from '../model/historyStack.ts';
import { getElementDefinition } from './index.ts';
import { hasNumber, hasString, isRecord } from './schema.ts';
import { isDateFormatId } from '../text/dateFormat.ts';
// The version constant lives with the draft layer in src/lib/drafts/ (it is
// stamped there); re-exported so the editor-side callers and tests keep one
// name for it. `migrateDraftRecord` below is where a bump gets its step.
import { DRAFT_SCHEMA_VERSION } from '../../lib/drafts/draftPolicy.js';
export { DRAFT_SCHEMA_VERSION };

const ELEMENT_TYPES: readonly ElementType[] = [
  'text', 'rectangle', 'ellipse', 'line', 'symbol', 'signature', 'whiteout', 'blackout', 'blur',
];

/**
 * Redact's text-run redaction preview mark. Not part of the shared
 * `ElementType` union or registry (that unification is SIGN-14 scope), so it
 * needs its own shape guard here or every real Redact draft carrying one would
 * be quarantined as invalid.
 */
export interface DeleteMarkElement extends HistoryElement {
  type: 'delete';
  sourceObjectId: string;
  kind: string;
  left: number;
  top: number;
  width: number;
  height: number;
  [field: string]: unknown;
}

export type DraftElement = EditorElement | DeleteMarkElement;

function isDeleteMarkElement(value: unknown): value is DeleteMarkElement {
  return isRecord(value) && value.type === 'delete' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasString(value, 'sourceObjectId') && hasString(value, 'kind')
    && hasNumber(value, 'left') && hasNumber(value, 'top') && hasNumber(value, 'width') && hasNumber(value, 'height');
}

export function isEditorElement(value: unknown): value is EditorElement {
  if (!isRecord(value) || !hasString(value, 'type')) return false;
  const type = value.type as ElementType;
  return ELEMENT_TYPES.includes(type) && getElementDefinition(type).schema(value);
}

export function isDraftElement(value: unknown): value is DraftElement {
  return isEditorElement(value) || isDeleteMarkElement(value);
}

/**
 * Version-to-version step function. Records written before this change (or
 * whose `schemaVersion` is behind the current one) pass through every step in
 * order; a record already at `DRAFT_SCHEMA_VERSION` is returned unchanged.
 * Add the next step here, not as a one-off `if` at a call site.
 */
export function migrateDraftRecord(record: unknown): unknown {
  if (!isRecord(record)) return record;
  const version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 0;
  let migrated = record;

  if (version < 1) {
    // Redact wrote elements keyed by `style` before E4.4's flat `type`
    // discriminant. Verbatim behavior moved here from PdfRedactTool.tsx.
    const elements = Array.isArray(migrated.elements)
      ? migrated.elements.map((element) => {
          if (!isRecord(element) || element.type) return element;
          const { style, ...rest } = element as Record<string, unknown>;
          return { ...rest, type: style || 'blackout' };
        })
      : migrated.elements;
    migrated = { ...migrated, elements };
  }

  if (version < 2 && isRecord(migrated.extra) && Array.isArray(migrated.extra.actionHistory)) {
    const liveElements = Array.isArray(migrated.elements) ? migrated.elements : [];
    const actionHistory = migrated.extra.actionHistory.flatMap((candidate) => {
      if (!isRecord(candidate) || !hasString(candidate, 'id') || !hasString(candidate, 'type')) return [];
      const legacySnapshots = Array.isArray(candidate.snapshot) ? candidate.snapshot : null;
      // A legacy deletion retained the element but not its former array index.
      // Appending it would silently change z-order, so it is not a dependable
      // command and is intentionally dropped. Legacy additions are recoverable:
      // their still-live element supplies both the complete snapshot and index.
      if (legacySnapshots) return [];
      const captured = liveElements.flatMap((element, index) => (
        isRecord(element) && element.id === candidate.elementId ? [{ element, index }] : []
      ));
      if (captured.length === 0) return [];
      return [{
        id: candidate.id,
        type: candidate.type,
        operation: legacySnapshots ? 'delete' : 'add',
        pageIndex: candidate.pageIndex,
        description: candidate.description,
        timestamp: candidate.timestamp,
        elements: captured,
      }];
    });
    migrated = { ...migrated, extra: { ...migrated.extra, actionHistory } };
  }

  return { ...migrated, schemaVersion: DRAFT_SCHEMA_VERSION };
}

/**
 * The document's carried style (SIGN-33), validated one key at a time: a
 * malformed value drops only that key - wrong type, an empty string, a
 * non-positive number, or a value outside its enum - never the whole
 * object, so a corrupt `strokeWidth` cannot cost the document its carried
 * font. `migrateLegacyCarried` below folds a SIGN-32 draft's flat
 * `carriedFont`/`carriedFontSize`/`carriedDirection` fields into this shape.
 * The app-wide style (SIGN-35, preferenceStore.ts's `getAppStyle`) is read
 * back through this same validator.
 */
export function validateDocumentStyle(value: unknown): Partial<DocumentStyle> {
  if (!isRecord(value)) return {};
  const carried: Partial<DocumentStyle> = {};
  if (hasString(value, 'font') && (value.font as string)) carried.font = value.font as string;
  if (hasNumber(value, 'fontSize') && (value.fontSize as number) > 0) carried.fontSize = value.fontSize as number;
  if (value.direction === 'ltr' || value.direction === 'rtl') carried.direction = value.direction;
  if (hasString(value, 'color') && (value.color as string)) carried.color = value.color as string;
  if (value.textAlign === 'left' || value.textAlign === 'center' || value.textAlign === 'right') {
    carried.textAlign = value.textAlign;
  }
  if (typeof value.bold === 'boolean') carried.bold = value.bold;
  if (typeof value.italic === 'boolean') carried.italic = value.italic;
  if (isDateFormatId(value.dateFormat)) carried.dateFormat = value.dateFormat;
  if (value.symbolMark === 'check' || value.symbolMark === 'x' || value.symbolMark === 'dot') {
    carried.symbolMark = value.symbolMark;
  }
  if (hasNumber(value, 'symbolWidth') && (value.symbolWidth as number) > 0) carried.symbolWidth = value.symbolWidth as number;
  if (hasNumber(value, 'strokeWidth') && (value.strokeWidth as number) > 0) carried.strokeWidth = value.strokeWidth as number;
  if (hasString(value, 'whiteoutColor') && (value.whiteoutColor as string)) carried.whiteoutColor = value.whiteoutColor as string;
  if (hasNumber(value, 'signatureWidth') && (value.signatureWidth as number) > 0) {
    carried.signatureWidth = value.signatureWidth as number;
  }
  return carried;
}

/**
 * A SIGN-32 draft's flat `carriedFont`/`carriedFontSize`/`carriedDirection`
 * restore into `carried.font`/`fontSize`/`direction`, validated the same way
 * as any other key - only when `extra.carried` itself does not already carry
 * that key, so a SIGN-33 draft's own value always wins.
 */
function migrateLegacyCarried(extra: Record<string, unknown>, carried: Partial<DocumentStyle>): Partial<DocumentStyle> {
  const migrated = { ...carried };
  if (migrated.font === undefined && hasString(extra, 'carriedFont') && (extra.carriedFont as string)) {
    migrated.font = extra.carriedFont as string;
  }
  if (migrated.fontSize === undefined && hasNumber(extra, 'carriedFontSize') && (extra.carriedFontSize as number) > 0) {
    migrated.fontSize = extra.carriedFontSize as number;
  }
  if (migrated.direction === undefined && (extra.carriedDirection === 'ltr' || extra.carriedDirection === 'rtl')) {
    migrated.direction = extra.carriedDirection;
  }
  return migrated;
}

export interface ValidatedElements<TElement extends HistoryElement = DraftElement> {
  valid: TElement[];
  droppedCount: number;
}

/**
 * Drops any element that isn't a recognized, well-formed shape instead of
 * throwing - a corrupt or foreign record should lose the offending elements,
 * not take down the whole restore. Logs a summary (never PDF content) when
 * anything was dropped.
 */
export function validateDraftElements<TElement extends HistoryElement = DraftElement>(
  elements: unknown[],
  isElement: (value: unknown) => value is TElement = isDraftElement as unknown as (value: unknown) => value is TElement,
): ValidatedElements<TElement> {
  const seenIds = new Set<string>();
  const valid: TElement[] = [];
  const droppedTypes: string[] = [];

  for (const element of elements) {
    if (!isRecord(element)) {
      droppedTypes.push(typeof element);
      continue;
    }
    if (!hasNumber(element, 'pageIndex') || !Number.isInteger(element.pageIndex) || (element.pageIndex as number) < 0) {
      droppedTypes.push(String(element.type ?? 'unknown'));
      continue;
    }
    if (!hasString(element, 'id') || !(element.id as string) || seenIds.has(element.id as string)) {
      droppedTypes.push(String(element.type ?? 'unknown'));
      continue;
    }
    if (!isElement(element)) {
      droppedTypes.push(String(element.type ?? 'unknown'));
      continue;
    }
    seenIds.add(element.id as string);
    valid.push(element);
  }

  const droppedCount = droppedTypes.length;
  if (droppedCount > 0) {
    console.error(`draftValidation: dropped ${droppedCount} invalid element(s):`, droppedTypes);
  }
  return { valid, droppedCount };
}

/**
 * Drops any 'update' history entry whose patches would corrupt an element -
 * `isActionHistoryEntry` checks an update's shape only, never its values, so a
 * persisted `after: { type: 'bogus' }` would otherwise pass validation and
 * crash the renderer the moment Undo or Redo wrote it onto a live element.
 * Walks `history` newest-first from the already-validated live `elements`
 * (history is newest-first, and reverting walks back in time): for an update
 * entry, each changed element is looked up in the walk's current state; if
 * present, both `{ ...element, ...before }` and `{ ...element, ...after }`
 * must be a valid element, or the whole entry is dropped and left unreverted.
 * An update whose element is absent at that point is kept, since applying it
 * is a no-op. Every kept entry (add and delete included) is then reverted
 * into the walk state so older entries are checked against elements as they
 * existed at that point in time - a kept newer delete brings its elements
 * back for an older update on them to be checked against.
 */
export function dropUnsafeUpdates<TElement extends HistoryElement>(
  elements: readonly TElement[],
  history: readonly ActionHistoryEntry<TElement>[],
  isElement: (value: unknown) => value is TElement,
): ActionHistoryEntry<TElement>[] {
  let current = elements;
  const kept: ActionHistoryEntry<TElement>[] = [];
  let droppedCount = 0;

  for (const entry of history) {
    if (entry.operation === 'update') {
      const byId = new Map(current.map((element) => [element.id, element]));
      const safe = entry.updates.every((update) => {
        const element = byId.get(update.id);
        if (!element) return true;
        return isElement({ ...element, ...update.before }) && isElement({ ...element, ...update.after });
      });
      if (!safe) {
        droppedCount += 1;
        continue;
      }
    }
    kept.push(entry);
    current = revertHistoryEntries(current, [entry]);
  }

  if (droppedCount > 0) {
    console.error(`draftValidation: dropped ${droppedCount} update(s) that would corrupt an element`);
  }
  return kept;
}

export interface ValidatedDraftRecord<TElement extends HistoryElement = DraftElement> {
  fileName: string;
  fileType?: string;
  fileBytes: ArrayBuffer;
  elements: TElement[];
  /** The document's carried style (SIGN-33) is Sign-only; a Redact record
   * simply never carries one, and it comes back undefined for it. */
  extra?: {
    actionHistory?: ActionHistoryEntry<TElement>[];
    carried?: Partial<DocumentStyle>;
  };
}

function isNonEmptyArrayBuffer(value: unknown): value is ArrayBuffer {
  // Duck-typed rather than `instanceof ArrayBuffer` - an ArrayBuffer crossing a
  // realm boundary (e.g. Node's TextEncoder vs. jsdom's window.ArrayBuffer,
  // seen under Vitest) fails `instanceof` despite being a real ArrayBuffer.
  return isRecord(value) && typeof value.byteLength === 'number' && value.byteLength > 0;
}

/**
 * Top-level shape check, then validates `elements`. Returns `null` for
 * anything unusable as a draft (matching the existing "falsy fileBytes means
 * no draft" restore behavior), never throws.
 */
export function validateDraftRecord(record: unknown): ValidatedDraftRecord | null;
export function validateDraftRecord<TElement extends HistoryElement>(
  record: unknown,
  isElement: (value: unknown) => value is TElement,
): ValidatedDraftRecord<TElement> | null;
export function validateDraftRecord<TElement extends HistoryElement = DraftElement>(
  record: unknown,
  isElement: (value: unknown) => value is TElement = isDraftElement as unknown as (value: unknown) => value is TElement,
): ValidatedDraftRecord<TElement> | null {
  if (!isRecord(record)) return null;
  if (!hasString(record, 'fileName') || !(record.fileName as string)) return null;
  if (!isNonEmptyArrayBuffer(record.fileBytes)) return null;

  const elements = Array.isArray(record.elements) ? record.elements : [];
  const { valid } = validateDraftElements(elements, isElement);
  const rawHistory = isRecord(record.extra) && Array.isArray(record.extra.actionHistory)
    ? record.extra.actionHistory
    : [];
  const actionHistory = rawHistory.filter((entry): entry is ActionHistoryEntry<TElement> => (
    isActionHistoryEntry(entry, isElement)
  ));
  if (actionHistory.length !== rawHistory.length) {
    console.error(`draftValidation: dropped ${rawHistory.length - actionHistory.length} invalid history command(s)`);
  }
  // Each command is checked on its own (isActionHistoryEntry), so a malformed
  // 'update' drops alone and the rest of the history survives. Shape alone
  // does not catch a corrupted value (an `after.type` of a real string that
  // is not a real type), so dropUnsafeUpdates checks each update's patches
  // against the walked element state before a later undo/redo can write them
  // onto a live element.
  const safeHistory = dropUnsafeUpdates(valid, actionHistory, isElement);
  // The depth cap pushCommand keeps is applied here too, so a draft saved
  // before UNDO-04 capped it comes back no deeper than one saved after.
  safeHistory.splice(MAX_HISTORY_DEPTH);
  // SIGN-33: Sign-only, optional - a Redact record or a draft written before
  // this existed simply has none, and it comes back undefined rather than
  // failing the whole restore. Each key is validated on its own
  // (validateDocumentStyle), and a SIGN-32 draft's flat carriedFont/
  // carriedFontSize/carriedDirection fields migrate into it.
  const carried: Partial<DocumentStyle> | undefined = isRecord(record.extra)
    ? migrateLegacyCarried(record.extra, validateDocumentStyle(record.extra.carried))
    : undefined;

  return {
    fileName: record.fileName as string,
    fileType: typeof record.fileType === 'string' ? record.fileType : undefined,
    fileBytes: record.fileBytes,
    elements: valid,
    extra: isRecord(record.extra) ? { actionHistory: safeHistory, carried } : undefined,
  };
}
