import type { EditorElement, ElementType } from '../model/editorModel.ts';
import { isActionHistoryEntry, type ActionHistoryEntry, type HistoryElement } from '../model/actionHistory.ts';
import { getElementDefinition } from './index.ts';
import { hasNumber, hasString, isRecord } from './schema.ts';

/**
 * Bump when a future change needs a real migration step; `migrateDraftRecord`
 * is the place to add it. Stamped onto every record written by
 * `useDraftPersistence.js`'s `buildRecord`; a record with no `schemaVersion`
 * predates this and is treated as version 0.
 */
export const DRAFT_SCHEMA_VERSION = 2;

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

export interface ValidatedDraftRecord<TElement extends HistoryElement = DraftElement> {
  fileName: string;
  fileType?: string;
  fileBytes: ArrayBuffer;
  elements: TElement[];
  extra?: { actionHistory?: ActionHistoryEntry<TElement>[] };
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

  return {
    fileName: record.fileName as string,
    fileType: typeof record.fileType === 'string' ? record.fileType : undefined,
    fileBytes: record.fileBytes,
    elements: valid,
    extra: isRecord(record.extra) ? { actionHistory } : undefined,
  };
}
