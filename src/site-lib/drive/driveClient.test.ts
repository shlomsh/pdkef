import { describe, expect, it, vi } from 'vitest';
import { fetchDriveFile } from './driveClient.ts';

const BASE = 'https://www.googleapis.com/drive/v3/files/abc%2F1';
const META_URL = `${BASE}?fields=name,mimeType&supportsAllDrives=true`;
const MEDIA_URL = `${BASE}?alt=media&supportsAllDrives=true`;

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}
function bin(bytes: ArrayBuffer, status = 200) {
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => bytes } as unknown as Response;
}
function status(code: number) {
  return { ok: false, status: code } as unknown as Response;
}
function fakeFetch(...responses: Array<Response | Error>) {
  const queue = [...responses];
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next as Response;
  });
}

const REF = { fileId: 'abc/1' };

describe('fetchDriveFile', () => {
  it('fetches metadata then bytes with exact URLs and bearer header', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const f = fakeFetch(json({ name: 'a.pdf', mimeType: 'application/pdf' }), bin(bytes));
    const res = await fetchDriveFile(f as unknown as typeof fetch, 'tok', REF);
    expect(res).toEqual({ ok: true, name: 'a.pdf', mimeType: 'application/pdf', bytes });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toBe(META_URL);
    expect(f.mock.calls[1][0]).toBe(MEDIA_URL);
    expect(f.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(f.mock.calls[1][1]?.headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('sends the resource key header on both requests when given', async () => {
    const f = fakeFetch(json({ name: 'a.pdf', mimeType: 'application/pdf' }), bin(new ArrayBuffer(0)));
    await fetchDriveFile(f as unknown as typeof fetch, 'tok', { fileId: 'abc/1', resourceKey: 'rk' });
    const headers = { Authorization: 'Bearer tok', 'X-Goog-Drive-Resource-Keys': 'abc/1/rk' };
    expect(f.mock.calls[0][1]?.headers).toEqual(headers);
    expect(f.mock.calls[1][1]?.headers).toEqual(headers);
  });

  it('maps a thrown metadata fetch to network', async () => {
    const f = fakeFetch(new Error('offline'));
    expect(await fetchDriveFile(f as unknown as typeof fetch, 't', REF)).toEqual({ ok: false, error: 'network' });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not-found'],
    [500, 'network'],
    [429, 'network'],
  ])('maps metadata status %i to %s', async (code, error) => {
    const f = fakeFetch(status(code));
    expect(await fetchDriveFile(f as unknown as typeof fetch, 't', REF)).toEqual({ ok: false, error });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('returns not-pdf without downloading the bytes', async () => {
    const f = fakeFetch(json({ name: 'a.doc', mimeType: 'application/msword' }));
    expect(await fetchDriveFile(f as unknown as typeof fetch, 't', REF)).toEqual({ ok: false, error: 'not-pdf' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('maps a thrown download to network', async () => {
    const f = fakeFetch(json({ name: 'a.pdf', mimeType: 'application/pdf' }), new Error('offline'));
    expect(await fetchDriveFile(f as unknown as typeof fetch, 't', REF)).toEqual({ ok: false, error: 'network' });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not-found'],
    [503, 'network'],
  ])('maps download status %i to %s', async (code, error) => {
    const f = fakeFetch(json({ name: 'a.pdf', mimeType: 'application/pdf' }), status(code));
    expect(await fetchDriveFile(f as unknown as typeof fetch, 't', REF)).toEqual({ ok: false, error });
  });

  it('maps unreadable metadata or bytes to network instead of throwing', async () => {
    const badJson = { ok: true, status: 200, json: async () => { throw new Error('bad'); } } as unknown as Response;
    expect(await fetchDriveFile(fakeFetch(badJson) as unknown as typeof fetch, 't', REF)).toEqual({ ok: false, error: 'network' });
    const badBytes = { ok: true, status: 200, arrayBuffer: async () => { throw new Error('bad'); } } as unknown as Response;
    const f = fakeFetch(json({ name: 'a.pdf', mimeType: 'application/pdf' }), badBytes);
    expect(await fetchDriveFile(f as unknown as typeof fetch, 't', REF)).toEqual({ ok: false, error: 'network' });
  });

  it('accepts the types the caller lists and reports the type back', async () => {
    const f = fakeFetch(json({ name: 'a.png', mimeType: 'image/png' }), bin(new ArrayBuffer(1)));
    const res = await fetchDriveFile(f as unknown as typeof fetch, 'tok', REF, { accept: ['application/pdf', 'image/png'] });
    expect(res).toMatchObject({ ok: true, mimeType: 'image/png' });
  });

  it('still refuses a type outside the accepted list', async () => {
    const f = fakeFetch(json({ name: 'a.png', mimeType: 'image/png' }));
    expect(await fetchDriveFile(f as unknown as typeof fetch, 'tok', REF)).toEqual({ ok: false, error: 'not-pdf' });
  });
});
