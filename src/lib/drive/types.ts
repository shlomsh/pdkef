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
