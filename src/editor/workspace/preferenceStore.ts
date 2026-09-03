// Workspace-owned, best-effort preferences for the Sign and Redact editors.
//
// These values intentionally remain in localStorage: unlike draft records,
// they are tiny synchronous preferences that should survive opening either
// tool. Keeping the key map and serialization here stops UI components from
// becoming persistence adapters while preserving the established on-device
// `pdf-toolkit:*` data format for existing users.

import type { SavedSignature } from '../model/savedSignature.ts';

export interface EditorPreferences {
  savedSignatures: SavedSignature[];
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

const STORAGE_KEYS: { [K in EditorPreferenceKey]: string } = {
  savedSignatures: 'pdf-toolkit:signatures',
  lastColor: 'pdf-toolkit:lastColor',
  lastWhiteoutColor: 'pdf-toolkit:lastWhiteoutColor',
  lastFont: 'pdf-toolkit:lastFont',
  lastFontSize: 'pdf-toolkit:lastFontSize',
  lastDirection: 'pdf-toolkit:lastDirection',
  lastSymbolWidth: 'pdf-toolkit:lastSymbolWidth',
  lastSymbolMark: 'pdf-toolkit:lastSymbolMark',
  lastSignatureWidth: 'pdf-toolkit:lastSignatureWidth',
};

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
    && typeof (value as SavedSignature).dataUrl === 'string'
    && Number.isFinite((value as SavedSignature).aspectRatio)
    && (value as SavedSignature).aspectRatio > 0,
  );
}

function readSavedSignatures(value: string): SavedSignature[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(isSavedSignature) ? parsed : null;
  } catch {
    return null;
  }
}

const READERS: { [K in EditorPreferenceKey]: (value: string) => EditorPreferences[K] | null } = {
  savedSignatures: readSavedSignatures,
  lastColor: readString,
  lastWhiteoutColor: readString,
  lastFont: readString,
  lastFontSize: readPositiveNumber,
  lastDirection: readString,
  lastSymbolWidth: readPositiveNumber,
  lastSymbolMark: readSymbolMark,
  lastSignatureWidth: readPositiveNumber,
};

const WRITERS: { [K in EditorPreferenceKey]: (value: EditorPreferences[K]) => string } = {
  savedSignatures: JSON.stringify,
  lastColor: String,
  lastWhiteoutColor: String,
  lastFont: String,
  lastFontSize: String,
  lastDirection: String,
  lastSymbolWidth: String,
  lastSymbolMark: String,
  lastSignatureWidth: String,
};

/** Reads one editor preference, or null when storage is absent, blocked, or invalid. */
export function getEditorPreference<K extends EditorPreferenceKey>(key: K): EditorPreferences[K] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    if (raw === null) return null;
    return READERS[key](raw) as EditorPreferences[K] | null;
  } catch {
    return null;
  }
}

/** Writes one editor preference. A blocked storage backend is non-fatal. */
export function setEditorPreference<K extends EditorPreferenceKey>(key: K, value: EditorPreferences[K]): boolean {
  try {
    localStorage.setItem(STORAGE_KEYS[key], WRITERS[key](value));
    return true;
  } catch {
    return false;
  }
}
