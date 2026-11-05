// MERGE-26: the contract between a tool's Save to Google Drive and the /drive/ page, which alone talks to
// Google. The tool parks its output under `driveSaveKey(id)` and opens `driveSaveHref(id)` in a new tab;
// that tab uploads it and answers on DRIVE_SAVE_CHANNEL.

export const DRIVE_SAVE_CHANNEL = 'pdkef-drive-save';

export type DriveSaveFile = { fileName: string; fileType: string; fileBytes: ArrayBuffer };
/** What a tool parks. `folderName` is set when several files go into one new folder. */
export type DriveSavePayload = { files: DriveSaveFile[]; folderName?: string };
export type DriveSaveAnswer = { id: string; status: 'saved' | 'failed' };

export const driveSaveKey = (id: string) => `drive-save-${id}`;
export const driveSaveHref = (id: string) => `/drive/?save=${encodeURIComponent(id)}`;
