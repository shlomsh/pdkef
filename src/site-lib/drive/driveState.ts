import type { DriveState } from './types.ts';

const FILE_ID = /^[A-Za-z0-9_-]{10,}$/;

const malformed: DriveState = { ok: false, reason: 'malformed' };

/** Reads the `?state=` Drive sends to an "Open with" app. Pure: never throws, never touches the DOM. */
export function parseDriveState(search: string): DriveState {
  const raw = new URLSearchParams(search).get('state');
  if (!raw) return { ok: false, reason: 'missing' };

  let state: unknown;
  try {
    state = JSON.parse(raw);
  } catch {
    // expected: a hand-edited or truncated link is reported as 'malformed'
    return malformed;
  }
  if (typeof state !== 'object' || state === null) return malformed;

  const { ids, action, resourceKeys, userId } = state as Record<string, unknown>;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) return malformed;
  if (action !== undefined && action !== 'open') return { ok: false, reason: 'not-open' };

  const fileId = ids[0] as string;
  if (!FILE_ID.test(fileId)) return malformed;

  const key = typeof resourceKeys === 'object' && resourceKeys !== null ? (resourceKeys as Record<string, unknown>)[fileId] : undefined;
  return {
    ok: true,
    fileId,
    ...(typeof key === 'string' && { resourceKey: key }),
    ...(typeof userId === 'string' && userId && { userId }),
  };
}
