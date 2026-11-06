import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, resetNotesCacheForTests } from '../../api/notes.ts';

// The notes endpoint reads the store at most once an hour per warm instance and never throws.

const note = (comment, extra = {}) => JSON.stringify({ tool: 'merge', stars: 5, comment, place: 'Nakuru, Kenya', ...extra });
const answer = (list) => async () => new Response(JSON.stringify([{ result: list }]), { status: 200 });
const bodyOf = async (res) => (await res.json()).notes;

describe('GET /api/notes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
    process.env.KV_REST_API_URL = 'https://store.invalid';
    process.env.KV_REST_API_TOKEN = 'test-token';
    resetNotesCacheForTests();
  });
  afterEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reads the store once for two requests, then again after the hour', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(answer([note('a')]));
    await GET();
    await GET();
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3600 * 1000 + 1);
    await GET();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('sends the notes newest first with the hour cache headers', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(answer([note('old'), note('new')]));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('public, max-age=3600');
    expect((await bodyOf(res)).map((n) => n.comment)).toEqual(['new', 'old']);
  });

  it('shrinks max-age as the memo ages, so a copy never outlives it', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(answer([note('a')]));
    await GET();
    vi.advanceTimersByTime(40 * 60 * 1000);
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=1200');
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('public, max-age=1200');
  });

  it('never allows stale-while-revalidate', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(answer([note('a')]));
    const res = await GET();
    expect(res.headers.get('Cache-Control')).not.toContain('stale-while-revalidate');
    expect(res.headers.get('Vercel-CDN-Cache-Control')).not.toContain('stale-while-revalidate');
  });

  it('reads the store once for two requests that arrive together', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(answer([note('a')]));
    await Promise.all([GET(), GET()]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('gives an empty list with the short cache when the read fails, and does not throw', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual([]);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('public, max-age=300');
    await GET();
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300 * 1000 + 1);
    await GET();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('is empty, without a read, when the store is not configured', async () => {
    delete process.env.KV_REST_API_URL;
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await GET();
    expect(await bodyOf(res)).toEqual([]);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps serving a good memo when a later read fails', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(answer([note('kept')]));
    await GET();
    spy.mockRejectedValue(new Error('down'));
    vi.advanceTimersByTime(3600 * 1000 + 1);
    const res = await GET();
    expect((await bodyOf(res)).map((n) => n.comment)).toEqual(['kept']);
  });

  it('drops a malformed stored entry', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(answer([note('ok'), '{broken', note('bad stars', { stars: 7 }), note('extra', { name: 'x' })]));
    expect((await bodyOf(await GET())).map((n) => n.comment)).toEqual(['ok']);
  });

  it('carries at most 12', async () => {
    const list = Array.from({ length: 20 }, (_, i) => note(`n${i}`));
    vi.spyOn(globalThis, 'fetch').mockImplementation(answer(list));
    expect(await bodyOf(await GET())).toHaveLength(12);
  });
});
