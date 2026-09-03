// Workspace-owned, best-effort preferences for the Sign and Redact editors.
//
// The old `pdf-toolkit:*` keys remain a read-compatible migration source. New
// writes use one versioned record per local user scope. Today that scope is an
// opaque deterministic browser-profile boundary; an authenticated shell can supply its
// own opaque stable scope through EditorPreferenceOptions without changing UI
// code or the record format.

import type { SavedSignature } from '../model/savedSignature.ts';

export interface EditorPreferences {
  savedSignatures: SavedSignature[];
  penColor: string;
  penThickness: number;
  lastColor: string;
  lastWhiteoutColor: string;
  lastFont: string;
  lastFontSize: number;
  lastDirection: string;
  lastSymbolWidth: number;
  lastSymbolMark: 'check' | 'x' | 'dot';
  lastSignatureWidth: number;
}

export type EditorPreferenceKey = keyof EditorPreferences;

/** Increment only when the persisted record shape needs a migration. */
export const EDITOR_PREFERENCE_RECORD_VERSION = 1;

const LEGACY_STORAGE_KEYS: { [K in EditorPreferenceKey]: string } = {
  savedSignatures: 'pdf-toolkit:signatures',
  penColor: 'pdf-toolkit:penColor',
  penThickness: 'pdf-toolkit:penThickness',
  lastColor: 'pdf-toolkit:lastColor',
  lastWhiteoutColor: 'pdf-toolkit:lastWhiteoutColor',
  lastFont: 'pdf-toolkit:lastFont',
  lastFontSize: 'pdf-toolkit:lastFontSize',
  lastDirection: 'pdf-toolkit:lastDirection',
  lastSymbolWidth: 'pdf-toolkit:lastSymbolWidth',
  lastSymbolMark: 'pdf-toolkit:lastSymbolMark',
  lastSignatureWidth: 'pdf-toolkit:lastSignatureWidth',
};

const RECORD_KEY_PREFIX = 'pdf-toolkit:editor-preferences:v1:';
const TAB_ID_KEY = 'pdf-toolkit:editor-preferences-tab-id';
const DEFAULT_EDITOR_USER_SCOPE = 'local-browser-profile';

type RecordListener = (record: PreferenceRecord) => void;
const localRecordListeners = new Map<string, Set<RecordListener>>();

export interface EditorPreferenceOptions {
  /**
   * An opaque, stable identifier for the current local user. Pass this from a
   * future account shell; do not use an email address or other personal data.
   */
  userScope?: string;
}

export interface EditorPreferenceChange<K extends EditorPreferenceKey> {
  value: EditorPreferences[K] | null;
  revision: number | null;
  /** Concurrent writes resolve deterministically by revision, timestamp, then writer id. */
  conflictPolicy: 'last-writer-wins';
}

interface PreferenceRecord {
  schemaVersion: typeof EDITOR_PREFERENCE_RECORD_VERSION;
  revision: number;
  updatedAt: number;
  writerId: string;
  values: Partial<EditorPreferences>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: string): string | null {
  return value || null;
}

function readPositiveNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readSymbolMark(value: string): EditorPreferences['lastSymbolMark'] | null {
  return value === 'check' || value === 'x' || value === 'dot' ? value : null;
}

function isSavedSignature(value: unknown): value is SavedSignature {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as SavedSignature).id === 'string'
    && (value as SavedSignature).id.length > 0
    && typeof (value as SavedSignature).dataUrl === 'string'
    && (value as SavedSignature).dataUrl.startsWith('data:image/')
    && Number.isFinite((value as SavedSignature).aspectRatio)
    && (value as SavedSignature).aspectRatio > 0,
  );
}

function readSavedSignatures(value: string): SavedSignature[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 10 || !parsed.every(isSavedSignature)) return null;
    const ids = new Set(parsed.map((signature) => signature.id));
    return ids.size === parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

const LEGACY_READERS: { [K in EditorPreferenceKey]: (value: string) => EditorPreferences[K] | null } = {
  savedSignatures: readSavedSignatures,
  penColor: readString,
  penThickness: readPositiveNumber,
  lastColor: readString,
  lastWhiteoutColor: readString,
  lastFont: readString,
  lastFontSize: readPositiveNumber,
  lastDirection: readString,
  lastSymbolWidth: readPositiveNumber,
  lastSymbolMark: readSymbolMark,
  lastSignatureWidth: readPositiveNumber,
};

const LEGACY_WRITERS: { [K in EditorPreferenceKey]: (value: EditorPreferences[K]) => string } = {
  savedSignatures: JSON.stringify,
  penColor: String,
  penThickness: String,
  lastColor: String,
  lastWhiteoutColor: String,
  lastFont: String,
  lastFontSize: String,
  lastDirection: String,
  lastSymbolWidth: String,
  lastSymbolMark: String,
  lastSignatureWidth: String,
};

function isPreferenceValue<K extends EditorPreferenceKey>(key: K, value: unknown): value is EditorPreferences[K] {
  switch (key) {
    case 'savedSignatures':
      return Array.isArray(value)
        && value.length <= 10
        && value.every(isSavedSignature)
        && new Set(value.map((signature) => signature.id)).size === value.length;
    case 'lastFontSize':
    case 'penThickness':
    case 'lastSymbolWidth':
    case 'lastSignatureWidth':
      return typeof value === 'number' && Number.isFinite(value) && value > 0;
    case 'lastSymbolMark':
      return value === 'check' || value === 'x' || value === 'dot';
    default:
      return typeof value === 'string' && value.length > 0;
  }
}

function readValues(raw: unknown): Partial<EditorPreferences> | null {
  if (!isObject(raw)) return null;
  const values: Partial<EditorPreferences> = {};
  (Object.keys(LEGACY_STORAGE_KEYS) as EditorPreferenceKey[]).forEach((key) => {
    const value = raw[key];
    if (isPreferenceValue(key, value)) {
      (values as Record<EditorPreferenceKey, unknown>)[key] = value;
    }
  });
  return values;
}

function migrateRecord(parsed: unknown): PreferenceRecord | null {
  if (!isObject(parsed)) return null;
  const version = parsed.schemaVersion ?? parsed.version;
  const rawValues = parsed.values ?? parsed.preferences;
  const values = readValues(rawValues);
  if (values === null) return null;

  if (version === EDITOR_PREFERENCE_RECORD_VERSION) {
    if (!Number.isInteger(parsed.revision) || (parsed.revision as number) < 0
      || !Number.isFinite(parsed.updatedAt) || (parsed.updatedAt as number) < 0
      || typeof parsed.writerId !== 'string' || parsed.writerId.length === 0) return null;
    return {
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: parsed.revision as number,
      updatedAt: parsed.updatedAt as number,
      writerId: parsed.writerId,
      values,
    };
  }

  // Version 0 was the brief pre-release envelope. It held already typed values
  // under `preferences`; accept it once and rewrite it as v1 on the next write.
  if (version === 0 || version === undefined) {
    return {
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: Number.isInteger(parsed.revision) && (parsed.revision as number) >= 0 ? parsed.revision as number : 0,
      updatedAt: Number.isFinite(parsed.updatedAt) && (parsed.updatedAt as number) >= 0 ? parsed.updatedAt as number : 0,
      writerId: typeof parsed.writerId === 'string' && parsed.writerId ? parsed.writerId : 'legacy',
      values,
    };
  }
  return null;
}

function makeId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to a non-cryptographic identifier. It only distinguishes
    // storage writers and is never used as an authentication secret.
  }
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normaliseScope(scope: string | undefined): string | null {
  const trimmed = scope?.trim();
  return trimmed && trimmed.length <= 160 ? trimmed : null;
}

/** Returns the current opaque local-user scope. */
export function getEditorUserScope(options: EditorPreferenceOptions = {}): string | null {
  if (options.userScope !== undefined) return normaliseScope(options.userScope);
  // localStorage is already isolated by browser profile and origin. A fixed
  // scope therefore shares data between tabs opened at the same time, without
  // racing to create a separate identifier in each fresh tab.
  return DEFAULT_EDITOR_USER_SCOPE;
}

function recordKey(scope: string): string {
  return `${RECORD_KEY_PREFIX}${encodeURIComponent(scope)}`;
}

function getTabId(): string {
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const created = makeId('tab-');
    sessionStorage.setItem(TAB_ID_KEY, created);
    return created;
  } catch {
    return makeId('tab-');
  }
}

function readRecord(raw: string | null): PreferenceRecord | null {
  if (raw === null) return null;
  try {
    return migrateRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readLegacyValues(): Partial<EditorPreferences> {
  const values: Partial<EditorPreferences> = {};
  (Object.keys(LEGACY_STORAGE_KEYS) as EditorPreferenceKey[]).forEach((key) => {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEYS[key]);
    if (raw === null) return;
    const value = LEGACY_READERS[key](raw);
    if (value !== null) (values as Record<EditorPreferenceKey, unknown>)[key] = value;
  });
  return values;
}

function readLegacyPreference<K extends EditorPreferenceKey>(key: K): EditorPreferences[K] | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEYS[key]);
  return raw === null ? null : LEGACY_READERS[key](raw);
}

function writeRecord(scope: string, record: PreferenceRecord): void {
  localStorage.setItem(recordKey(scope), JSON.stringify(record));
}

function noteLocalWrite(keyForScope: string, record: PreferenceRecord): void {
  localRecordListeners.get(keyForScope)?.forEach((listener) => listener(record));
}

function restoreWinningRecord(keyForScope: string, winner: PreferenceRecord): void {
  try {
    const current = readRecord(localStorage.getItem(keyForScope));
    if (!current || compareRecords(current, winner) < 0) {
      localStorage.setItem(keyForScope, JSON.stringify(winner));
    }
  } catch {
    // Storage synchronization is best effort, like ordinary preference writes.
  }
}

/**
 * Reads one editor preference, or null when storage is absent, blocked, or invalid.
 * Existing unscoped values are migrated on first use and intentionally retained as
 * a fallback for older deployed tabs until those tabs age out.
 */
export function getEditorPreference<K extends EditorPreferenceKey>(
  key: K,
  options: EditorPreferenceOptions = {},
): EditorPreferences[K] | null {
  try {
    const scope = getEditorUserScope(options);
    if (!scope) return null;
    const raw = localStorage.getItem(recordKey(scope));
    const record = readRecord(raw);
    if (record) {
      if (key in record.values) return record.values[key] ?? null;
      // A tab running the previous release may still own an un-migrated key.
      // The default anonymous scope may read it until that tab is gone. Explicit
      // (future authenticated) scopes never consult these shared legacy keys.
      return options.userScope === undefined ? readLegacyPreference(key) : null;
    }
    if (raw !== null) return null; // A corrupt scoped record must not revive stale legacy data.

    // Explicit (future account) scopes never import the browser-profile's old
    // unscoped values: doing so would cross the account boundary on first use.
    if (options.userScope !== undefined) return null;
    const legacyValues = readLegacyValues();
    if (Object.keys(legacyValues).length === 0) return null;
    const migrated: PreferenceRecord = {
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: 0,
      updatedAt: 0,
      writerId: 'legacy',
      values: legacyValues,
    };
    writeRecord(scope, migrated);
    return migrated.values[key] ?? null;
  } catch {
    return null;
  }
}

/**
 * Writes one preference using a read-merge-write revision. If two tabs race,
 * the record with the greater (revision, updatedAt, writerId) wins; subscribers
 * ignore older storage events and apply that winner consistently.
 */
export function setEditorPreference<K extends EditorPreferenceKey>(
  key: K,
  value: EditorPreferences[K],
  options: EditorPreferenceOptions = {},
): boolean {
  if (!isPreferenceValue(key, value)) return false;
  try {
    const scope = getEditorUserScope(options);
    if (!scope) return false;
    const latest = readRecord(localStorage.getItem(recordKey(scope)));
    const now = Date.now();
    const record: PreferenceRecord = {
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: (latest?.revision ?? 0) + 1,
      updatedAt: Math.max(now, (latest?.updatedAt ?? 0) + 1),
      writerId: getTabId(),
      values: { ...latest?.values, [key]: value },
    };
    writeRecord(scope, record);
    noteLocalWrite(recordKey(scope), record);
    // Keep the established default-profile keys current while an older deployed
    // tab can still be open. Explicit user scopes deliberately do not mirror
    // here, so an eventual account boundary cannot leak into a shared key.
    if (options.userScope === undefined) localStorage.setItem(LEGACY_STORAGE_KEYS[key], LEGACY_WRITERS[key](value));
    return true;
  } catch {
    return false;
  }
}

function compareRecords(left: PreferenceRecord, right: PreferenceRecord): number {
  if (left.revision !== right.revision) return left.revision - right.revision;
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt;
  return left.writerId.localeCompare(right.writerId);
}

/** Subscribe to same-user changes. Concurrent records converge by the documented LWW comparator. */
export function subscribeToEditorPreference<K extends EditorPreferenceKey>(
  key: K,
  listener: (change: EditorPreferenceChange<K>) => void,
  options: EditorPreferenceOptions = {},
): () => void {
  const scope = getEditorUserScope(options);
  if (!scope || typeof window === 'undefined') return () => {};
  const keyForScope = recordKey(scope);
  let newest: PreferenceRecord | null = null;
  try {
    newest = readRecord(localStorage.getItem(keyForScope));
  } catch {
    return () => {};
  }

  const acceptRecord = (incoming: PreferenceRecord, notify: boolean) => {
    if (newest && compareRecords(incoming, newest) <= 0) {
      if (compareRecords(incoming, newest) < 0) restoreWinningRecord(keyForScope, newest);
      return;
    }
    newest = incoming;
    restoreWinningRecord(keyForScope, incoming);
    if (notify) listener({ value: incoming.values[key] ?? null, revision: incoming.revision, conflictPolicy: 'last-writer-wins' });
  };
  const onLocalWrite: RecordListener = (record) => acceptRecord(record, false);
  const listeners = localRecordListeners.get(keyForScope) ?? new Set<RecordListener>();
  listeners.add(onLocalWrite);
  localRecordListeners.set(keyForScope, listeners);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== keyForScope && event.key !== null) return;
    const incoming = readRecord(event.newValue);
    if (!incoming) {
      // `clear()` reports a null key; removing just this scoped record reports
      // its key with a null value. Either operation resets the comparison base
      // so a later fresh record is not rejected as older than deleted state.
      newest = null;
      listener({ value: null, revision: null, conflictPolicy: 'last-writer-wins' });
      return;
    }
    acceptRecord(incoming, true);
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    listeners.delete(onLocalWrite);
    if (listeners.size === 0) localRecordListeners.delete(keyForScope);
  };
}
