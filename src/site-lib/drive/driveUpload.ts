// MERGE-26: put a tool's output into the person's Google Drive. Pure: the only global it touches is the injected fetch.
import type { DriveSaveFile, DriveSavePayload } from '#lib/handoff/driveSaveLink.ts';

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink';
const FILES = 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export type DriveUploadError = 'unauthorized' | 'quota' | 'network';
type DriveUploadResult = { ok: true; link: string | null; id: string } | { ok: false; error: DriveUploadError };
type DriveSaveResult = { ok: true; link: string | null } | { ok: false; error: DriveUploadError };

const fail = (error: DriveUploadError): { ok: false; error: DriveUploadError } => ({ ok: false, error });

async function errorFor(response: Response): Promise<DriveUploadError> {
  if (response.status === 401) return 'unauthorized';
  if (response.status !== 403) return 'network';
  try {
    return (await response.text()).includes('storageQuotaExceeded') ? 'quota' : 'unauthorized';
  } catch {
    // expected: an unreadable body is an ordinary refusal
    return 'unauthorized';
  }
}

async function readResult(response: Response): Promise<DriveUploadResult> {
  const info = (await response.json()) as { id?: string; webViewLink?: string };
  if (!info.id) return fail('network');
  return { ok: true, id: info.id, link: info.webViewLink ?? null };
}

/** @testSeam */
export async function uploadDriveFile(fetchFn: typeof fetch, token: string, file: DriveSaveFile, parentId?: string): Promise<DriveUploadResult> {
  try {
    const metadata: { name: string; mimeType: string; parents?: string[] } = { name: file.fileName, mimeType: file.fileType };
    if (parentId) metadata.parents = [parentId];
    const start = await fetchFn(UPLOAD, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.fileType,
      },
      body: JSON.stringify(metadata),
    });
    if (!start.ok) return fail(await errorFor(start));
    const location = start.headers.get('Location');
    if (!location) return fail('network');
    const sent = await fetchFn(location, { method: 'PUT', headers: { 'Content-Type': file.fileType }, body: file.fileBytes });
    if (!sent.ok) return fail(await errorFor(sent));
    return await readResult(sent);
  } catch {
    // expected: a dropped connection or unreadable body becomes the 'network' result the page shows
    return fail('network');
  }
}

/** @testSeam */
export async function createDriveFolder(fetchFn: typeof fetch, token: string, name: string): Promise<DriveUploadResult> {
  try {
    const made = await fetchFn(FILES, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
    });
    if (!made.ok) return fail(await errorFor(made));
    return await readResult(made);
  } catch {
    // expected: a dropped connection or unreadable body becomes the 'network' result the page shows
    return fail('network');
  }
}

export async function saveToDrive(fetchFn: typeof fetch, token: string, payload: DriveSavePayload): Promise<DriveSaveResult> {
  let parentId: string | undefined;
  let folderLink: string | null = null;
  if (payload.folderName) {
    const folder = await createDriveFolder(fetchFn, token, payload.folderName);
    if (!folder.ok) return folder;
    parentId = folder.id;
    folderLink = folder.link;
  }
  let firstLink: string | null = null;
  for (const [index, file] of payload.files.entries()) {
    const sent = await uploadDriveFile(fetchFn, token, file, parentId);
    if (!sent.ok) return sent;
    if (index === 0) firstLink = sent.link;
  }
  return { ok: true, link: payload.folderName ? folderLink : firstLink };
}
