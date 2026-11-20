import { describe, expect, it } from 'vitest';
import { HttpResponse } from 'msw';
import { answerInTurn, answerNetwork, sentHeaders, server } from '../../test/support/network.ts';
import { fetchDriveFile } from './driveClient.ts';

const BASE = 'https://www.googleapis.com/drive/v3/files/abc%2F1';
const META_URL = `${BASE}?fields=name,mimeType&supportsAllDrives=true`;
const MEDIA_URL = `${BASE}?alt=media&supportsAllDrives=true`;
const FILE = 'https://www.googleapis.com/drive/v3/files/:id';

answerNetwork();

const json = (body: { name: string; mimeType: string }) => () => HttpResponse.json(body);
const bin = (bytes: ArrayBuffer) => () => new HttpResponse(bytes);
const status = (code: number) => () => new HttpResponse(null, { status: code });
const offline = () => HttpResponse.error();
const unreadableBody = () => new HttpResponse(new ReadableStream({ pull(c) { c.error(new Error('bad')); } }));

const drive = (...answers: Array<() => Response>) => answerInTurn('get', FILE, ...answers);

const REF = { fileId: 'abc/1' };

describe('fetchDriveFile', () => {
  it('fetches metadata then bytes with exact URLs and bearer header', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const seen = drive(json({ name: 'a.pdf', mimeType: 'application/pdf' }), bin(bytes));
    const res = await fetchDriveFile(fetch, 'tok', REF);
    expect(res).toEqual({ ok: true, name: 'a.pdf', mimeType: 'application/pdf', bytes });
    expect(seen).toHaveLength(2);
    expect(seen[0].url).toBe(META_URL);
    expect(seen[1].url).toBe(MEDIA_URL);
    expect(sentHeaders(seen[0])).toEqual({ authorization: 'Bearer tok' });
    expect(sentHeaders(seen[1])).toEqual({ authorization: 'Bearer tok' });
  });

  it('sends the resource key header on both requests when given', async () => {
    const seen = drive(json({ name: 'a.pdf', mimeType: 'application/pdf' }), bin(new ArrayBuffer(0)));
    await fetchDriveFile(fetch, 'tok', { fileId: 'abc/1', resourceKey: 'rk' });
    const headers = { authorization: 'Bearer tok', 'x-goog-drive-resource-keys': 'abc/1/rk' };
    expect(sentHeaders(seen[0])).toEqual(headers);
    expect(sentHeaders(seen[1])).toEqual(headers);
  });

  it('maps a thrown metadata fetch to network', async () => {
    drive(offline);
    expect(await fetchDriveFile(fetch, 't', REF)).toEqual({ ok: false, error: 'network' });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not-found'],
    [500, 'network'],
    [429, 'network'],
  ])('maps metadata status %i to %s', async (code, error) => {
    const seen = drive(status(code));
    expect(await fetchDriveFile(fetch, 't', REF)).toEqual({ ok: false, error });
    expect(seen).toHaveLength(1);
  });

  it('returns not-pdf without downloading the bytes', async () => {
    const seen = drive(json({ name: 'a.doc', mimeType: 'application/msword' }));
    expect(await fetchDriveFile(fetch, 't', REF)).toEqual({ ok: false, error: 'not-pdf' });
    expect(seen).toHaveLength(1);
  });

  it('maps a thrown download to network', async () => {
    drive(json({ name: 'a.pdf', mimeType: 'application/pdf' }), offline);
    expect(await fetchDriveFile(fetch, 't', REF)).toEqual({ ok: false, error: 'network' });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not-found'],
    [503, 'network'],
  ])('maps download status %i to %s', async (code, error) => {
    drive(json({ name: 'a.pdf', mimeType: 'application/pdf' }), status(code));
    expect(await fetchDriveFile(fetch, 't', REF)).toEqual({ ok: false, error });
  });

  it('maps unreadable metadata or bytes to network instead of throwing', async () => {
    drive(() => new HttpResponse('not json', { headers: { 'Content-Type': 'application/json' } }));
    expect(await fetchDriveFile(fetch, 't', REF)).toEqual({ ok: false, error: 'network' });
    server.resetHandlers();
    drive(json({ name: 'a.pdf', mimeType: 'application/pdf' }), unreadableBody);
    expect(await fetchDriveFile(fetch, 't', REF)).toEqual({ ok: false, error: 'network' });
  });

  it('accepts the types the caller lists and reports the type back', async () => {
    drive(json({ name: 'a.png', mimeType: 'image/png' }), bin(new ArrayBuffer(1)));
    const res = await fetchDriveFile(fetch, 'tok', REF, { accept: ['application/pdf', 'image/png'] });
    expect(res).toMatchObject({ ok: true, mimeType: 'image/png' });
  });

  it('still refuses a type outside the accepted list', async () => {
    drive(json({ name: 'a.png', mimeType: 'image/png' }));
    expect(await fetchDriveFile(fetch, 'tok', REF)).toEqual({ ok: false, error: 'not-pdf' });
  });
});
