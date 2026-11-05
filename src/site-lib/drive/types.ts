// MERGE-25: the contract between the pieces of the Drive app. Pure types, no behaviour.

/** What Drive puts in `?state=` when someone picks "Open with > PDkef". */
export type DriveState =
  | { ok: true; fileId: string; resourceKey?: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'not-open' };

export type DriveFileError = 'unauthorized' | 'not-found' | 'not-pdf' | 'network';

export type DriveFileResult =
  | { ok: true; name: string; bytes: ArrayBuffer }
  | { ok: false; error: DriveFileError };

export type DriveTokenResult = { ok: true; token: string } | { ok: false; error: 'denied' | 'blocked' | 'script' };

// DRIVE-01: the contract for picking a file on /drive/.

/** How this browser reaches the Picker. `redirect` is one tap; `popup` costs a tap on /drive/ and is the default. */
export type DriveRoute = 'redirect' | 'popup';

/** What a visit to /drive/ is for. `returnTo` is always a same-origin path; `tool` is null for the home page. */
export type DriveIntent =
  | { kind: 'open-with'; fileId: string; resourceKey?: string }
  | { kind: 'pick'; tool: string | null; returnTo: string }
  | { kind: 'none' };

export type SavedDriveToken = { token: string; until: number };

/** What Google put in the fragment when it sent the person back. `state` is the string we gave it. */
export type DriveRedirectReturn =
  | { kind: 'token'; token: string; expiresInSeconds: number; state: string }
  | { kind: 'error'; error: string; state: string }
  | { kind: 'none' };

export type DrivePickedDoc = { id: string; name: string; mimeType: string };
export type DrivePickResult = { action: 'picked'; docs: DrivePickedDoc[] } | { action: 'cancel' };
