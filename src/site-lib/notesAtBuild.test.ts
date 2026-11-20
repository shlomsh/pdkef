import { describe, expect, it, vi } from 'vitest';
import { HttpResponse } from 'msw';
import { answerInTurn, answerNetwork, sentHeaders } from '../test/support/network.ts';
import { loadNotes, notesFromEnv } from './notesAtBuild.js';

// The build reads the approved notes once with the read-only token and never fails for want of the store.

const env = { KV_REST_API_URL: 'https://store.example/', KV_REST_API_READ_ONLY_TOKEN: 'ro' };
const note = (comment: string, extra = {}) => JSON.stringify({ tool: 'merge', stars: 5, comment, place: 'Nakuru, Kenya', ...extra });
const reply = (list: string[]) => [{ result: list }, { result: [] }];
const COMMANDS = [['LRANGE', 'rating:notes', -12, -1], ['LRANGE', 'rating:entries', -200, -1]];
const PIPELINE = 'https://store.example/pipeline';

answerNetwork();

const store = (...answers: Array<() => Response>) => answerInTurn('post', PIPELINE, ...answers);
const ok = (body: unknown) => () => HttpResponse.json(body as never);

describe('loadNotes', () => {
  it('reads the notes and the record in one pipeline with the read-only token, newest first', async () => {
    const seen = store(ok(reply([note('old'), note('new')])));
    const notes = await loadNotes(env);
    expect(notes.map((n) => n.comment)).toEqual(['new', 'old']);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://store.example/pipeline');
    expect(sentHeaders(seen[0])).toEqual({ authorization: 'Bearer ro', 'content-type': 'application/json' });
    expect(await seen[0].json()).toEqual(COMMANDS);
  });

  it('is empty, without a read or a warning each time, when there is no URL or no read-only token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seen = store();
    expect(await loadNotes({})).toEqual([]);
    expect(await loadNotes({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 'write' })).toEqual([]);
    expect(seen).toHaveLength(0);
    warn.mockRestore();
  });

  it('is empty and warns once on a network error, a bad status or an unreadable body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    store(() => HttpResponse.error(), () => new HttpResponse(null, { status: 500 }), () => new HttpResponse('not json'), ok({ not: 'an array' }));
    expect(await loadNotes(env)).toEqual([]);
    expect(await loadNotes(env)).toEqual([]);
    expect(await loadNotes(env)).toEqual([]);
    expect(await loadNotes(env)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });

  it('drops malformed entries and keeps at most nine for a tool', async () => {
    const list = [note('ok'), '{broken', note('bad stars', { stars: 7 }), note('extra', { name: 'x' }), ...Array.from({ length: 10 }, (_, i) => note(`n${i}`))];
    store(ok(reply(list)));
    const notes = await loadNotes(env);
    expect(notes).toHaveLength(9);
    expect(notes.map((n) => n.comment)).not.toContain('bad stars');
  });

  it('names a vote by region and country, one per tool and country', async () => {
    const vote = (extra = {}) => JSON.stringify({ tool: 'sign', stars: 4, country: 'KE', region: '31', ...extra });
    store(ok([{ result: [] }, { result: [vote(), vote()] }]));
    const notes = await loadNotes(env);
    expect(notes).toEqual([{ tool: 'sign', stars: 4, country: 'KE', region: 'Nakuru' }]);
  });
});

describe('notesFromEnv', () => {
  it('reads the store once however many pages ask', async () => {
    const seen = store(ok(reply([note('a')])));
    const a = notesFromEnv(env);
    const b = notesFromEnv(env);
    expect(await a).toEqual(await b);
    expect(seen).toHaveLength(1);
  });
});
