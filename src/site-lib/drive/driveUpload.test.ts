import { describe, expect, it } from 'vitest';
import { HttpResponse, type JsonBodyType } from 'msw';
import { answerInTurn, answerNetwork, sentHeaders } from '../../test/support/network.ts';
import { createDriveFolder, saveToDrive, uploadDriveFile } from './driveUpload.ts';

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const UPLOAD_QUERY = `${UPLOAD}?uploadType=resumable&fields=id,webViewLink`;
const FILES = 'https://www.googleapis.com/drive/v3/files';
const FILES_QUERY = `${FILES}?fields=id,webViewLink`;
const SESSION = 'https://up.example/:id';

answerNetwork();

const file = { fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: new Uint8Array([1, 2, 3]).buffer };

const json = (body: JsonBodyType = {}, status = 200, headers: Record<string, string> = {}) => () => HttpResponse.json(body, { status, headers });
const status = (code: number) => () => new HttpResponse(null, { status: code });
const offline = () => HttpResponse.error();
const location = (id: string) => json({}, 200, { Location: `https://up.example/${id}` });
const saved = (id: string, link: string) => json({ id, webViewLink: link });

const route = (method: 'post' | 'put', url: string, ...answers: Array<() => Response>) => answerInTurn(method, url, ...answers);

describe('uploadDriveFile', () => {
  it('starts a resumable session, then puts the bytes to its Location', async () => {
    const posts = route('post', UPLOAD, location('session'));
    const puts = route('put', SESSION, saved('F1', 'https://drive/F1'));
    const out = await uploadDriveFile(fetch, 'tok', file, 'P1');
    expect(out).toEqual({ ok: true, link: 'https://drive/F1', id: 'F1' });
    expect(posts).toHaveLength(1);
    expect(puts).toHaveLength(1);
    expect(posts[0].url).toBe(UPLOAD_QUERY);
    expect(posts[0].method).toBe('POST');
    expect(sentHeaders(posts[0]).authorization).toBe('Bearer tok');
    expect(sentHeaders(posts[0])['x-upload-content-type']).toBe('application/pdf');
    expect((await posts[0].json())).toEqual({ name: 'a.pdf', mimeType: 'application/pdf', parents: ['P1'] });
    expect(puts[0].url).toBe('https://up.example/session');
    expect(puts[0].method).toBe('PUT');
    expect(sentHeaders(puts[0])['content-type']).toBe('application/pdf');
    expect([...new Uint8Array(await puts[0].arrayBuffer())]).toEqual([1, 2, 3]);
  });
  it('omits parents without a folder', async () => {
    const posts = route('post', UPLOAD, location('s'));
    route('put', SESSION, json({ id: 'F1' }));
    const out = await uploadDriveFile(fetch, 't', file);
    expect((await posts[0].json())).toEqual({ name: 'a.pdf', mimeType: 'application/pdf' });
    expect(out).toMatchObject({ ok: true, link: null });
  });
  it('maps 401 to unauthorized', async () => {
    route('post', UPLOAD, status(401));
    expect(await uploadDriveFile(fetch, 't', file)).toEqual({ ok: false, error: 'unauthorized' });
  });
  it('maps a 403 quota body to quota, any other 403 to unauthorized', async () => {
    route('post', UPLOAD, json({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }, 403), json({ error: { message: 'no' } }, 403));
    expect(await uploadDriveFile(fetch, 't', file)).toEqual({ ok: false, error: 'quota' });
    expect(await uploadDriveFile(fetch, 't', file)).toEqual({ ok: false, error: 'unauthorized' });
  });
  it('maps a missing Location, other statuses and throws to network', async () => {
    route('post', UPLOAD, json(), status(500), offline);
    expect(await uploadDriveFile(fetch, 't', file)).toEqual({ ok: false, error: 'network' });
    expect(await uploadDriveFile(fetch, 't', file)).toEqual({ ok: false, error: 'network' });
    expect(await uploadDriveFile(fetch, 't', file)).toEqual({ ok: false, error: 'network' });
  });
  it('maps a failing PUT too', async () => {
    route('post', UPLOAD, location('s'));
    route('put', SESSION, status(401));
    expect(await uploadDriveFile(fetch, 't', file)).toEqual({ ok: false, error: 'unauthorized' });
  });
});

describe('createDriveFolder', () => {
  it('posts a folder and returns its id and link', async () => {
    const posts = route('post', FILES, saved('D1', 'https://drive/D1'));
    const out = await createDriveFolder(fetch, 'tok', 'Pages');
    expect(out).toEqual({ ok: true, link: 'https://drive/D1', id: 'D1' });
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(FILES_QUERY);
    expect((await posts[0].json())).toEqual({ name: 'Pages', mimeType: 'application/vnd.google-apps.folder' });
  });
});

describe('saveToDrive', () => {
  it('links the first file when there is no folder', async () => {
    route('post', UPLOAD, location('A'), location('B'));
    route('put', SESSION, saved('A', 'la'), saved('B', 'lb'));
    const out = await saveToDrive(fetch, 't', { files: [file, { ...file, fileName: 'b.pdf' }] });
    expect(out).toEqual({ ok: true, link: 'la' });
  });
  it('creates the folder, uploads into it and links the folder', async () => {
    const folders = route('post', FILES, saved('D', 'ld'));
    const posts = route('post', UPLOAD, location('A'), location('B'));
    route('put', SESSION, saved('A', 'la'), saved('B', 'lb'));
    const out = await saveToDrive(fetch, 't', { files: [file, file], folderName: 'Pages' });
    expect(out).toEqual({ ok: true, link: 'ld' });
    expect(folders).toHaveLength(1);
    expect(posts).toHaveLength(2);
    expect((await posts[0].json()).parents).toEqual(['D']);
  });
  it('stops at the first failure', async () => {
    const posts = route('post', UPLOAD, status(401));
    expect(await saveToDrive(fetch, 't', { files: [file, file] })).toEqual({ ok: false, error: 'unauthorized' });
    expect(posts).toHaveLength(1);
  });
});
