import { DRIVE_TOKEN_KEY } from '#lib/handoff/driveSaveLink.ts';
import type { SavedDriveToken } from './types.ts';

type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const MIN_REMAINING_MS = 60_000;

/** The saved Google token, or null when missing, malformed, or about to expire. Never throws. */
export function readSavedToken(storage: TokenStorage, now: number): string | null {
  try {
    const raw = storage.getItem(DRIVE_TOKEN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedDriveToken> | null;
    if (!saved || typeof saved.token !== 'string' || typeof saved.until !== 'number') return null;
    return saved.until - now >= MIN_REMAINING_MS ? saved.token : null;
  } catch {
    // expected: storage blocked or the saved value is not JSON
    return null;
  }
}

export function saveToken(storage: TokenStorage, token: string, expiresInSeconds: number, now: number): void {
  try {
    const saved: SavedDriveToken = { token, until: now + expiresInSeconds * 1000 };
    storage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(saved));
  } catch {
    // expected: storage blocked or full; the person signs in again next time
  }
}

export function forgetToken(storage: TokenStorage): void {
  try {
    storage.removeItem(DRIVE_TOKEN_KEY);
  } catch {
    // expected: storage blocked; the token then simply expires on its own
  }
}
