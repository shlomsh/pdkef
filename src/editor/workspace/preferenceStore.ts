// Workspace-owned, best-effort settings and saved-signature storage.
//
// Scalar settings live in a small versioned envelope. Signature image data is
// deliberately stored in a separate versioned library record: changing a font
// or colour must never stringify, broadcast, or risk evicting image bytes.

import type { SavedSignature } from '../model/savedSignature.ts';

export interface EditorPreferences {
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

/** Increment only when the persisted scalar-settings record shape changes. */
export const EDITOR_PREFERENCE_RECORD_VERSION = 1;
/** Increment only when the persisted signature-library record shape changes. */
export const SAVED_SIGNATURE_LIBRARY_VERSION = 1;

const LEGACY_STORAGE_KEYS: { [K in EditorPreferenceKey]: string } = {
  penColor: 'pdf-toolkit:penColor', penThickness: 'pdf-toolkit:penThickness',
  lastColor: 'pdf-toolkit:lastColor', lastWhiteoutColor: 'pdf-toolkit:lastWhiteoutColor',
  lastFont: 'pdf-toolkit:lastFont', lastFontSize: 'pdf-toolkit:lastFontSize',
  lastDirection: 'pdf-toolkit:lastDirection', lastSymbolWidth: 'pdf-toolkit:lastSymbolWidth',
  lastSymbolMark: 'pdf-toolkit:lastSymbolMark', lastSignatureWidth: 'pdf-toolkit:lastSignatureWidth',
};
const LEGACY_SIGNATURES_KEY = 'pdf-toolkit:signatures';
const RECORD_KEY_PREFIX = 'pdf-toolkit:editor-preferences:v1:';
const SIGNATURE_LIBRARY_KEY_PREFIX = 'pdf-toolkit:saved-signatures:v1:';
const TAB_ID_KEY = 'pdf-toolkit:editor-preferences-tab-id';
const DEFAULT_EDITOR_USER_SCOPE = 'local-browser-profile';

interface RevisionMetadata { revision: number; updatedAt: number; writerId: string; }
interface PreferenceRecord extends RevisionMetadata {
  schemaVersion: typeof EDITOR_PREFERENCE_RECORD_VERSION;
  values: Partial<EditorPreferences>;
}
interface SignatureLibraryRecord extends RevisionMetadata {
  schemaVersion: typeof SAVED_SIGNATURE_LIBRARY_VERSION;
  signatures: SavedSignature[];
}

type RecordListener<T> = (record: T) => void;
const localPreferenceListeners = new Map<string, Set<RecordListener<PreferenceRecord>>>();
const localSignatureListeners = new Map<string, Set<RecordListener<SignatureLibraryRecord>>>();

export interface EditorPreferenceOptions {
  /** An opaque stable local-user identifier; never pass an email address. */
  userScope?: string;
}
export interface EditorPreferenceChange<K extends EditorPreferenceKey> {
  value: EditorPreferences[K] | null;
  revision: number | null;
  conflictPolicy: 'last-writer-wins';
}
export interface SavedSignatureChange {
  value: SavedSignature[] | null;
  revision: number | null;
  conflictPolicy: 'last-writer-wins';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function readString(value: string): string | null { return value || null; }
function readPositiveNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function readSymbolMark(value: string): EditorPreferences['lastSymbolMark'] | null {
  return value === 'check' || value === 'x' || value === 'dot' ? value : null;
}
function isSavedSignature(value: unknown): value is SavedSignature {
  return Boolean(value && typeof value === 'object'
    && typeof (value as SavedSignature).id === 'string' && (value as SavedSignature).id.length > 0
    && typeof (value as SavedSignature).dataUrl === 'string' && (value as SavedSignature).dataUrl.startsWith('data:image/')
    && Number.isFinite((value as SavedSignature).aspectRatio) && (value as SavedSignature).aspectRatio > 0);
}
function readSavedSignatures(value: unknown): SavedSignature[] | null {
  let parsed = value;
  if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch { return null; } }
  if (!Array.isArray(parsed) || parsed.length > 10 || !parsed.every(isSavedSignature)) return null;
  return new Set(parsed.map((signature) => signature.id)).size === parsed.length ? parsed : null;
}

const LEGACY_READERS: { [K in EditorPreferenceKey]: (value: string) => EditorPreferences[K] | null } = {
  penColor: readString, penThickness: readPositiveNumber, lastColor: readString,
  lastWhiteoutColor: readString, lastFont: readString, lastFontSize: readPositiveNumber,
  lastDirection: readString, lastSymbolWidth: readPositiveNumber, lastSymbolMark: readSymbolMark,
  lastSignatureWidth: readPositiveNumber,
};
const LEGACY_WRITERS: { [K in EditorPreferenceKey]: (value: EditorPreferences[K]) => string } = {
  penColor: String, penThickness: String, lastColor: String, lastWhiteoutColor: String,
  lastFont: String, lastFontSize: String, lastDirection: String, lastSymbolWidth: String,
  lastSymbolMark: String, lastSignatureWidth: String,
};

function isPreferenceValue<K extends EditorPreferenceKey>(key: K, value: unknown): value is EditorPreferences[K] {
  switch (key) {
    case 'lastFontSize': case 'penThickness': case 'lastSymbolWidth': case 'lastSignatureWidth':
      return typeof value === 'number' && Number.isFinite(value) && value > 0;
    case 'lastSymbolMark': return value === 'check' || value === 'x' || value === 'dot';
    default: return typeof value === 'string' && value.length > 0;
  }
}
function readValues(raw: unknown): Partial<EditorPreferences> | null {
  if (!isObject(raw)) return null;
  const values: Partial<EditorPreferences> = {};
  (Object.keys(LEGACY_STORAGE_KEYS) as EditorPreferenceKey[]).forEach((key) => {
    if (isPreferenceValue(key, raw[key])) (values as Record<EditorPreferenceKey, unknown>)[key] = raw[key];
  });
  return values;
}
function validMetadata(parsed: Record<string, unknown>): RevisionMetadata | null {
  if (!Number.isInteger(parsed.revision) || (parsed.revision as number) < 0
    || !Number.isFinite(parsed.updatedAt) || (parsed.updatedAt as number) < 0
    || typeof parsed.writerId !== 'string' || !parsed.writerId) return null;
  return { revision: parsed.revision as number, updatedAt: parsed.updatedAt as number, writerId: parsed.writerId };
}
function legacyMetadata(parsed: Record<string, unknown>): RevisionMetadata {
  return {
    revision: Number.isInteger(parsed.revision) && (parsed.revision as number) >= 0 ? parsed.revision as number : 0,
    updatedAt: Number.isFinite(parsed.updatedAt) && (parsed.updatedAt as number) >= 0 ? parsed.updatedAt as number : 0,
    writerId: typeof parsed.writerId === 'string' && parsed.writerId ? parsed.writerId : 'legacy',
  };
}
function migratePreferenceRecord(parsed: unknown): PreferenceRecord | null {
  if (!isObject(parsed)) return null;
  const values = readValues(parsed.values ?? parsed.preferences);
  if (values === null) return null;
  const version = parsed.schemaVersion ?? parsed.version;
  if (version === EDITOR_PREFERENCE_RECORD_VERSION) {
    const metadata = validMetadata(parsed);
    return metadata ? { schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION, ...metadata, values } : null;
  }
  return version === 0 || version === undefined
    ? { schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION, ...legacyMetadata(parsed), values }
    : null;
}
function migrateSignatureLibrary(parsed: unknown): SignatureLibraryRecord | null {
  if (!isObject(parsed) || parsed.schemaVersion !== SAVED_SIGNATURE_LIBRARY_VERSION) return null;
  const signatures = readSavedSignatures(parsed.signatures); const metadata = validMetadata(parsed);
  return signatures && metadata ? { schemaVersion: SAVED_SIGNATURE_LIBRARY_VERSION, ...metadata, signatures } : null;
}
function oldRecordSignatures(raw: string | null): { signatures: SavedSignature[]; metadata: RevisionMetadata } | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw); if (!isObject(parsed)) return null;
    const contents = parsed.values ?? parsed.preferences;
    const signatures = isObject(contents) ? readSavedSignatures(contents.savedSignatures) : null;
    return signatures === null ? null : { signatures, metadata: legacyMetadata(parsed) };
  } catch { return null; }
}

function makeId(prefix: string): string {
  try { if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}${crypto.randomUUID()}`; } catch { /* fall through */ }
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function normaliseScope(scope: string | undefined): string | null {
  const trimmed = scope?.trim(); return trimmed && trimmed.length <= 160 ? trimmed : null;
}
export function getEditorUserScope(options: EditorPreferenceOptions = {}): string | null {
  return options.userScope !== undefined ? normaliseScope(options.userScope) : DEFAULT_EDITOR_USER_SCOPE;
}
function recordKey(scope: string): string { return `${RECORD_KEY_PREFIX}${encodeURIComponent(scope)}`; }
function signatureLibraryKey(scope: string): string { return `${SIGNATURE_LIBRARY_KEY_PREFIX}${encodeURIComponent(scope)}`; }
function getTabId(): string {
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY); if (existing) return existing;
    const created = makeId('tab-'); sessionStorage.setItem(TAB_ID_KEY, created); return created;
  } catch { return makeId('tab-'); }
}
function readPreferenceRecord(raw: string | null): PreferenceRecord | null {
  try { return raw === null ? null : migratePreferenceRecord(JSON.parse(raw)); } catch { return null; }
}
function readSignatureLibrary(raw: string | null): SignatureLibraryRecord | null {
  try { return raw === null ? null : migrateSignatureLibrary(JSON.parse(raw)); } catch { return null; }
}
function compareRecords(left: RevisionMetadata, right: RevisionMetadata): number {
  if (left.revision !== right.revision) return left.revision - right.revision;
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt;
  return left.writerId.localeCompare(right.writerId);
}
function readLegacyValues(): Partial<EditorPreferences> {
  const values: Partial<EditorPreferences> = {};
  (Object.keys(LEGACY_STORAGE_KEYS) as EditorPreferenceKey[]).forEach((key) => {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEYS[key]);
    const value = raw === null ? null : LEGACY_READERS[key](raw);
    if (value !== null) (values as Record<EditorPreferenceKey, unknown>)[key] = value;
  });
  return values;
}
function readLegacyPreference<K extends EditorPreferenceKey>(key: K): EditorPreferences[K] | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEYS[key]); return raw === null ? null : LEGACY_READERS[key](raw);
}
function noteLocalWrite<T>(listeners: Map<string, Set<RecordListener<T>>>, key: string, record: T): void {
  listeners.get(key)?.forEach((listener) => listener(record));
}
function restoreWinningRecord<T extends RevisionMetadata>(key: string, winner: T, read: (raw: string | null) => T | null): void {
  try { const current = read(localStorage.getItem(key)); if (!current || compareRecords(current, winner) < 0) localStorage.setItem(key, JSON.stringify(winner)); } catch { /* best effort */ }
}

// Migrate image bytes before a scalar rewrite, so a previous v0/v1 envelope
// cannot lose its library when it is rewritten without savedSignatures.
function migrateSignatureLibraryIfNeeded(scope: string, options: EditorPreferenceOptions): 'done' | 'none' | 'failed' {
  const assetKey = signatureLibraryKey(scope); const rawAsset = localStorage.getItem(assetKey);
  if (rawAsset !== null) return readSignatureLibrary(rawAsset) ? 'done' : 'failed';
  const old = oldRecordSignatures(localStorage.getItem(recordKey(scope)));
  const legacy = options.userScope === undefined ? readSavedSignatures(localStorage.getItem(LEGACY_SIGNATURES_KEY)) : null;
  const source = old ?? (legacy ? { signatures: legacy, metadata: { revision: 0, updatedAt: 0, writerId: 'legacy' } } : null);
  if (!source) return 'none';
  try {
    localStorage.setItem(assetKey, JSON.stringify({ schemaVersion: SAVED_SIGNATURE_LIBRARY_VERSION, ...source.metadata, signatures: source.signatures }));
    return 'done';
  } catch { return 'failed'; }
}

/** Reads one scalar preference; signature images are never part of this record. */
export function getEditorPreference<K extends EditorPreferenceKey>(key: K, options: EditorPreferenceOptions = {}): EditorPreferences[K] | null {
  try {
    const scope = getEditorUserScope(options); if (!scope) return null;
    const raw = localStorage.getItem(recordKey(scope)); const record = readPreferenceRecord(raw);
    if (record) return key in record.values ? record.values[key] ?? null : (options.userScope === undefined ? readLegacyPreference(key) : null);
    if (raw !== null || options.userScope !== undefined) return null;
    const values = readLegacyValues(); if (!Object.keys(values).length) return null;
    localStorage.setItem(recordKey(scope), JSON.stringify({ schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION, revision: 0, updatedAt: 0, writerId: 'legacy', values }));
    return values[key] ?? null;
  } catch { return null; }
}

/** Writes one scalar preference without serializing saved-signature image bytes. */
export function setEditorPreference<K extends EditorPreferenceKey>(key: K, value: EditorPreferences[K], options: EditorPreferenceOptions = {}): boolean {
  if (!isPreferenceValue(key, value)) return false;
  try {
    const scope = getEditorUserScope(options); if (!scope || migrateSignatureLibraryIfNeeded(scope, options) === 'failed') return false;
    const keyForScope = recordKey(scope); const latest = readPreferenceRecord(localStorage.getItem(keyForScope)); const now = Date.now();
    const record: PreferenceRecord = { schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION, revision: (latest?.revision ?? 0) + 1, updatedAt: Math.max(now, (latest?.updatedAt ?? 0) + 1), writerId: getTabId(), values: { ...latest?.values, [key]: value } };
    localStorage.setItem(keyForScope, JSON.stringify(record)); noteLocalWrite(localPreferenceListeners, keyForScope, record);
    if (options.userScope === undefined) localStorage.setItem(LEGACY_STORAGE_KEYS[key], LEGACY_WRITERS[key](value));
    return true;
  } catch { return false; }
}

/** Reads the independently versioned signature library, migrating old records once. */
export function getSavedSignatures(options: EditorPreferenceOptions = {}): SavedSignature[] | null {
  try {
    const scope = getEditorUserScope(options); if (!scope || migrateSignatureLibraryIfNeeded(scope, options) === 'failed') return null;
    return readSignatureLibrary(localStorage.getItem(signatureLibraryKey(scope)))?.signatures ?? null;
  } catch { return null; }
}

/** Saves the library as one asset record. false means it remains in memory only. */
export function setSavedSignatures(signatures: SavedSignature[], options: EditorPreferenceOptions = {}): boolean {
  if (readSavedSignatures(signatures) === null) return false;
  try {
    const scope = getEditorUserScope(options); if (!scope) return false;
    const keyForScope = signatureLibraryKey(scope); const latest = readSignatureLibrary(localStorage.getItem(keyForScope)); const now = Date.now();
    const record: SignatureLibraryRecord = { schemaVersion: SAVED_SIGNATURE_LIBRARY_VERSION, revision: (latest?.revision ?? 0) + 1, updatedAt: Math.max(now, (latest?.updatedAt ?? 0) + 1), writerId: getTabId(), signatures };
    localStorage.setItem(keyForScope, JSON.stringify(record)); noteLocalWrite(localSignatureListeners, keyForScope, record);
    if (options.userScope === undefined) { try { localStorage.setItem(LEGACY_SIGNATURES_KEY, JSON.stringify(signatures)); } catch { /* asset record already succeeded */ } }
    return true;
  } catch { return false; }
}

/** Subscribe to same-user scalar changes with deterministic LWW convergence. */
export function subscribeToEditorPreference<K extends EditorPreferenceKey>(key: K, listener: (change: EditorPreferenceChange<K>) => void, options: EditorPreferenceOptions = {}): () => void {
  const scope = getEditorUserScope(options); if (!scope || typeof window === 'undefined') return () => {};
  const keyForScope = recordKey(scope); let newest: PreferenceRecord | null;
  try { newest = readPreferenceRecord(localStorage.getItem(keyForScope)); } catch { return () => {}; }
  const accept = (incoming: PreferenceRecord, notify: boolean) => {
    if (newest && compareRecords(incoming, newest) <= 0) { if (compareRecords(incoming, newest) < 0) restoreWinningRecord(keyForScope, newest, readPreferenceRecord); return; }
    newest = incoming; restoreWinningRecord(keyForScope, incoming, readPreferenceRecord);
    if (notify) listener({ value: incoming.values[key] ?? null, revision: incoming.revision, conflictPolicy: 'last-writer-wins' });
  };
  const onLocal = (record: PreferenceRecord) => accept(record, false); const listeners = localPreferenceListeners.get(keyForScope) ?? new Set<RecordListener<PreferenceRecord>>(); listeners.add(onLocal); localPreferenceListeners.set(keyForScope, listeners);
  const onStorage = (event: StorageEvent) => { if (event.key !== keyForScope && event.key !== null) return; const incoming = readPreferenceRecord(event.newValue); if (!incoming) { newest = null; listener({ value: null, revision: null, conflictPolicy: 'last-writer-wins' }); } else accept(incoming, true); };
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener('storage', onStorage); listeners.delete(onLocal); if (!listeners.size) localPreferenceListeners.delete(keyForScope); };
}

/** Subscribe to additions/deletions in the separate signature-library record. */
export function subscribeToSavedSignatures(listener: (change: SavedSignatureChange) => void, options: EditorPreferenceOptions = {}): () => void {
  const scope = getEditorUserScope(options); if (!scope || typeof window === 'undefined') return () => {};
  const keyForScope = signatureLibraryKey(scope); let newest: SignatureLibraryRecord | null;
  try { newest = readSignatureLibrary(localStorage.getItem(keyForScope)); } catch { return () => {}; }
  const accept = (incoming: SignatureLibraryRecord, notify: boolean) => {
    if (newest && compareRecords(incoming, newest) <= 0) { if (compareRecords(incoming, newest) < 0) restoreWinningRecord(keyForScope, newest, readSignatureLibrary); return; }
    newest = incoming; restoreWinningRecord(keyForScope, incoming, readSignatureLibrary);
    if (notify) listener({ value: incoming.signatures, revision: incoming.revision, conflictPolicy: 'last-writer-wins' });
  };
  const onLocal = (record: SignatureLibraryRecord) => accept(record, false); const listeners = localSignatureListeners.get(keyForScope) ?? new Set<RecordListener<SignatureLibraryRecord>>(); listeners.add(onLocal); localSignatureListeners.set(keyForScope, listeners);
  const onStorage = (event: StorageEvent) => { if (event.key !== keyForScope && event.key !== null) return; const incoming = readSignatureLibrary(event.newValue); if (!incoming) { newest = null; listener({ value: null, revision: null, conflictPolicy: 'last-writer-wins' }); } else accept(incoming, true); };
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener('storage', onStorage); listeners.delete(onLocal); if (!listeners.size) localSignatureListeners.delete(keyForScope); };
}
