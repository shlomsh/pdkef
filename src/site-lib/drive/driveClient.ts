// MERGE-25: fetch an opened PDF from Drive by id. Pure: the only global it touches is the injected fetch.
import type { DriveFileError, DriveFileResult } from './types.ts';

const FILES = 'https://www.googleapis.com/drive/v3/files/';

function fail(error: DriveFileError): DriveFileResult {
  return { ok: false, error };
}

function errorForStatus(status: number): DriveFileError {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not-found';
  return 'network';
}

export async function fetchDriveFile(
  fetchFn: typeof fetch,
  token: string,
  ref: { fileId: string; resourceKey?: string },
): Promise<DriveFileResult> {
  const base = `${FILES}${encodeURIComponent(ref.fileId)}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (ref.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${ref.fileId}/${ref.resourceKey}`;

  try {
    const meta = await fetchFn(`${base}?fields=name,mimeType&supportsAllDrives=true`, { headers });
    if (!meta.ok) return fail(errorForStatus(meta.status));
    const info = (await meta.json()) as { name?: string; mimeType?: string };
    if (info.mimeType !== 'application/pdf') return fail('not-pdf');

    const media = await fetchFn(`${base}?alt=media&supportsAllDrives=true`, { headers });
    if (!media.ok) return fail(errorForStatus(media.status));
    return { ok: true, name: info.name ?? '', bytes: await media.arrayBuffer() };
  } catch {
    // expected: a dropped connection or unreadable body becomes the 'network' result the page shows
    return fail('network');
  }
}
