import { describe, expect, it, vi } from 'vitest';
import { RATING_MIN_VOTES, loadRatings, ratingText, summarize } from './ratingAggregate.js';
import { RATING_TOOLS } from '#lib/telemetry/ratingSchema.ts';

const env = { KV_REST_API_URL: 'https://store.example/', KV_REST_API_TOKEN: 't' };
const hash = (c: Record<string, number>) => ({ result: Object.entries(c).flatMap(([k, v]) => [k, String(v)]) });
const reply = (perTool: Record<string, Record<string, number>>) =>
  RATING_TOOLS.map((t) => hash(perTool[t] ?? {}));
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('summarize', () => {
  it('is null below the minimum and exact at it', () => {
    expect(RATING_MIN_VOTES).toBe(50);
    expect(summarize({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 49 })).toBeNull();
    expect(summarize({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 50 })).toEqual({ average: 5, count: 50 });
  });
  it('rounds the average to one decimal', () => {
    expect(summarize({ 1: 0, 2: 0, 3: 0, 4: 10, 5: 90 }, 1)).toEqual({ average: 4.9, count: 100 });
    expect(summarize({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 2 }, 1)).toEqual({ average: 3.7, count: 3 });
  });
  it('never reports an empty tool', () => {
    expect(summarize({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, 0)).toBeNull();
  });
});

describe('ratingText', () => {
  it('fills the same numbers into a template', () => {
    expect(ratingText('{average} from {count} ratings', { average: 4.8, count: 132 })).toBe('4.8 from 132 ratings');
  });
});

describe('loadRatings', () => {
  it('posts one pipeline and returns only pages over the minimum, pooling unlock and protect', async () => {
    const fetchImpl = vi.fn(async () =>
      ok(reply({ merge: { 5: 60 }, split: { 5: 10 }, unlock: { 4: 30 }, protect: { 5: 30 } })),
    );
    const out = await loadRatings(env, fetchImpl as any);
    expect(out).toEqual({ merge: { average: 5, count: 60 }, unlock: { average: 4.5, count: 60 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('https://store.example/pipeline');
    expect(init.headers.Authorization).toBe('Bearer t');
  });
  it('is empty without env, on a non-ok reply and on a throw', async () => {
    const never = vi.fn();
    expect(await loadRatings({}, never as any)).toEqual({});
    expect(never).not.toHaveBeenCalled();
    expect(await loadRatings(env, (async () => ({ ok: false }) as Response) as any)).toEqual({});
    expect(await loadRatings(env, (async () => { throw new Error('down'); }) as any)).toEqual({});
    expect(await loadRatings(env, (async () => ({ ok: true, json: async () => { throw new Error('bad'); } }) as any) as any)).toEqual({});
  });
});
