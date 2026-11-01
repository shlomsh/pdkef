import { ZOOM_MAX, ZOOM_MIN, type ZoomSetting } from './fit.ts';

const MODES = ['width', 'text', 'page'] as const;

export function serializeSetting(setting: ZoomSetting): string {
  return String(setting);
}

/** A stored setting, or null for anything that is not one. */
export function parseSetting(value: unknown): ZoomSetting | null {
  if (typeof value !== 'string') return null;
  const mode = MODES.find((m) => m === value);
  if (mode) return mode;
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX ? n : null;
}

/** R25: the document's own setting beats the remembered default, which beats Fit width. */
export function initialSetting(fromDraft: unknown, fromDefault: unknown): ZoomSetting {
  return parseSetting(fromDraft) ?? parseSetting(fromDefault) ?? 'width';
}
