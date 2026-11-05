import { describe, expect, it, vi } from 'vitest';
import { createDriveFolder, saveToDrive, uploadDriveFile } from './driveUpload.ts';

const file = { fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: new Uint8Array([1, 2, 3]).buffer };
const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('uploadDriveFile', () => {
  it('starts a resumable session, then puts the bytes to its Location', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(res(200, {}, { Location: 'https://up.example/session' }))
      .mockResolvedValueOnce(res(200, { id: 'F1', webViewLink: 'https://drive/F1' }));
    const out = await uploadDriveFile(fetchFn as unknown as typeof fetch, 'tok', file, 'P1');
    expect(out).toEqual({ ok: true, link: 'https://drive/F1', id: 'F1' });
    const [url1, init1] = fetchFn.mock.calls[0];
    expect(url1).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink');
    expect(init1.method).toBe('POST');
    expect(init1.headers.Authorization).toBe('Bearer tok');
    expect(init1.headers['X-Upload-Content-Type']).toBe('application/pdf');
    expect(JSON.parse(init1.body)).toEqual({ name: 'a.pdf', mimeType: 'application/pdf', parents: ['P1'] });
    const [url2, init2] = fetchFn.mock.calls[1];
    expect(url2).toBe('https://up.example/session');
    expect(init2.method).toBe('PUT');
    expect(init2.headers['Content-Type']).toBe('application/pdf');
    expect(init2.body).toBe(file.fileBytes);
  });
  it('omits parents without a folder', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(res(200, {}, { Location: 'https://up.example/s' }))
      .mockResolvedValueOnce(res(200, { id: 'F1' }));
    const out = await uploadDriveFile(fetchFn as unknown as typeof fetch, 't', file);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ name: 'a.pdf', mimeType: 'application/pdf' });
    expect(out).toMatchObject({ ok: true, link: null });
  });
  it('maps 401 to unauthorized', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(401));
    expect(await uploadDriveFile(fetchFn as unknown as typeof fetch, 't', file)).toEqual({ ok: false, error: 'unauthorized' });
  });
  it('maps a 403 quota body to quota, any other 403 to unauthorized', async () => {
    const quota = vi.fn().mockResolvedValue(res(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } }));
    expect(await uploadDriveFile(quota as unknown as typeof fetch, 't', file)).toEqual({ ok: false, error: 'quota' });
    const other = vi.fn().mockResolvedValue(res(403, { error: { message: 'no' } }));
    expect(await uploadDriveFile(other as unknown as typeof fetch, 't', file)).toEqual({ ok: false, error: 'unauthorized' });
  });
  it('maps a missing Location, other statuses and throws to network', async () => {
    const noLoc = vi.fn().mockResolvedValue(res(200));
    expect(await uploadDriveFile(noLoc as unknown as typeof fetch, 't', file)).toEqual({ ok: false, error: 'network' });
    const five = vi.fn().mockResolvedValue(res(500));
    expect(await uploadDriveFile(five as unknown as typeof fetch, 't', file)).toEqual({ ok: false, error: 'network' });
    const boom = vi.fn().mockRejectedValue(new Error('x'));
    expect(await uploadDriveFile(boom as unknown as typeof fetch, 't', file)).toEqual({ ok: false, error: 'network' });
  });
  it('maps a failing PUT too', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(res(200, {}, { Location: 'https://up.example/s' }))
      .mockResolvedValueOnce(res(401));
    expect(await uploadDriveFile(fetchFn as unknown as typeof fetch, 't', file)).toEqual({ ok: false, error: 'unauthorized' });
  });
});

describe('createDriveFolder', () => {
  it('posts a folder and returns its id and link', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, { id: 'D1', webViewLink: 'https://drive/D1' }));
    const out = await createDriveFolder(fetchFn as unknown as typeof fetch, 'tok', 'Pages');
    expect(out).toEqual({ ok: true, link: 'https://drive/D1', id: 'D1' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink');
    expect(JSON.parse(init.body)).toEqual({ name: 'Pages', mimeType: 'application/vnd.google-apps.folder' });
  });
});

describe('saveToDrive', () => {
  const upload = (id: string, link: string) => [res(200, {}, { Location: `https://up/${id}` }), res(200, { id, webViewLink: link })];
  it('links the first file when there is no folder', async () => {
    const fetchFn = vi.fn();
    for (const r of [...upload('A', 'la'), ...upload('B', 'lb')]) fetchFn.mockResolvedValueOnce(r);
    const out = await saveToDrive(fetchFn as unknown as typeof fetch, 't', { files: [file, { ...file, fileName: 'b.pdf' }] });
    expect(out).toEqual({ ok: true, link: 'la' });
  });
  it('creates the folder, uploads into it and links the folder', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(res(200, { id: 'D', webViewLink: 'ld' }));
    for (const r of [...upload('A', 'la'), ...upload('B', 'lb')]) fetchFn.mockResolvedValueOnce(r);
    const out = await saveToDrive(fetchFn as unknown as typeof fetch, 't', { files: [file, file], folderName: 'Pages' });
    expect(out).toEqual({ ok: true, link: 'ld' });
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).parents).toEqual(['D']);
  });
  it('stops at the first failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(401));
    expect(await saveToDrive(fetchFn as unknown as typeof fetch, 't', { files: [file, file] })).toEqual({ ok: false, error: 'unauthorized' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
