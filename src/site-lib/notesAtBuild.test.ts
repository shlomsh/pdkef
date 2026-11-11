import { describe, expect, it, vi } from 'vitest';
import { loadNotes, notesFromEnv } from './notesAtBuild.js';

// The build reads the approved notes once with the read-only token and never fails for want of the store.

const env = { KV_REST_API_URL: 'https://store.example/', KV_REST_API_READ_ONLY_TOKEN: 'ro' };
const note = (comment: string, extra = {}) => JSON.stringify({ tool: 'merge', stars: 5, comment, place: 'Nakuru, Kenya', ...extra });
const reply = (list: string[]) => [{ result: list }, { result: [] }];
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('loadNotes', () => {
  it('reads the notes and the record in one pipeline with the read-only token, newest first', async () => {
    const fetchImpl = vi.fn(async () => ok(reply([note('old'), note('new')])));
    const notes = await loadNotes(env, fetchImpl as never);
    expect(notes.map((n) => n.comment)).toEqual(['new', 'old']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://store.example/pipeline');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ro');
  });

  it('is empty, without a read or a warning each time, when there is no URL or no read-only token', async () => {
    const fetchImpl = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadNotes({}, fetchImpl as never)).toEqual([]);
    expect(await loadNotes({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 'write' }, fetchImpl as never)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is empty and warns once on a network error, a bad status or an unreadable body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadNotes(env, (async () => { throw new Error('down'); }) as never)).toEqual([]);
    expect(await loadNotes(env, (async () => ({ ok: false }) as Response) as never)).toEqual([]);
    expect(await loadNotes(env, (async () => ({ ok: true, json: async () => { throw new Error('bad'); } }) as never) as never)).toEqual([]);
    expect(await loadNotes(env, (async () => ok({ not: 'an array' })) as never)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });

  it('drops malformed entries and keeps at most four for a tool', async () => {
    const list = [note('ok'), '{broken', note('bad stars', { stars: 7 }), note('extra', { name: 'x' }), ...Array.from({ length: 10 }, (_, i) => note(`n${i}`))];
    const notes = await loadNotes(env, (async () => ok(reply(list))) as never);
    expect(notes).toHaveLength(4);
    expect(notes.map((n) => n.comment)).not.toContain('bad stars');
  });

  it('names a vote by region and country, one per tool and country', async () => {
    const vote = (extra = {}) => JSON.stringify({ tool: 'sign', stars: 4, country: 'KE', region: '31', ...extra });
    const notes = await loadNotes(env, (async () => ok([{ result: [] }, { result: [vote(), vote()] }])) as never);
    expect(notes).toEqual([{ tool: 'sign', stars: 4, country: 'KE', region: 'Nakuru' }]);
  });
});

describe('notesFromEnv', () => {
  it('reads the store once however many pages ask', async () => {
    const fetchImpl = vi.fn(async () => ok(reply([note('a')])));
    const a = notesFromEnv(env, fetchImpl as never);
    const b = notesFromEnv(env, fetchImpl as never);
    expect(await a).toEqual(await b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
