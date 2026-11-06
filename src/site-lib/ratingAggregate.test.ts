import { describe, expect, it, vi } from 'vitest';
import { RATING_MIN_VOTES, loadAppRating, ratingText, summarize } from './ratingAggregate.js';
import { RATING_TOOLS } from '#lib/telemetry/ratingSchema.ts';

const env = { KV_REST_API_URL: 'https://store.example/', KV_REST_API_TOKEN: 't' };
const hash = (c: Record<string, number>) => ({ result: Object.entries(c).flatMap(([k, v]) => [k, String(v)]) });
const reply = (perTool: Record<string, Record<string, number>>, entries: unknown[] = []) => [
  ...RATING_TOOLS.map((t) => hash(perTool[t] ?? {})),
  { result: entries },
];
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('summarize', () => {
  it('is null below the minimum and exact at it', () => {
    expect(RATING_MIN_VOTES).toBe(10);
    expect(summarize({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 9 })).toBeNull();
    expect(summarize({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 10 })).toEqual({ average: 5, count: 10 });
  });
  it('rounds the average to two decimals', () => {
    expect(summarize({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 21 }, 1)).toEqual({ average: 4.95, count: 22 });
    expect(summarize({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 2 }, 1)).toEqual({ average: 3.67, count: 3 });
  });
  it('never reports an empty tool', () => {
    expect(summarize({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, 0)).toBeNull();
  });
});

describe('ratingText', () => {
  it('fills the same numbers into a template', () => {
    expect(ratingText('{average} from {count} ratings in {countries}', { average: 4.8, count: 132, countries: 7 })).toBe('4.8 from 132 ratings in 7');
  });
});

describe('loadAppRating', () => {
  it('posts one pipeline and pools every tool into one rating for the app', async () => {
    const fetchImpl = vi.fn(async () => ok(reply({ merge: { 5: 4 }, sign: { 5: 2 }, redact: { 4: 1, 5: 15 } }, [
      '{"country":"KE"}', '{"country":"IL"}', '{"country":"IL","region":"TA"}', '{}', 'not json',
    ])));
    expect(await loadAppRating(env, fetchImpl as any)).toEqual({ average: 4.95, count: 22, countries: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('https://store.example/pipeline');
    expect(init.headers.Authorization).toBe('Bearer t');
  });
  it('is null under the minimum across all tools together', async () => {
    expect(await loadAppRating(env, (async () => ok(reply({ merge: { 5: 5 }, sign: { 5: 4 } }))) as any)).toBeNull();
  });
  it('is null without env, on a non-ok reply and on a throw', async () => {
    const never = vi.fn();
    expect(await loadAppRating({}, never as any)).toBeNull();
    expect(never).not.toHaveBeenCalled();
    expect(await loadAppRating(env, (async () => ({ ok: false }) as Response) as any)).toBeNull();
    expect(await loadAppRating(env, (async () => { throw new Error('down'); }) as any)).toBeNull();
    expect(await loadAppRating(env, (async () => ({ ok: true, json: async () => { throw new Error('bad'); } }) as any) as any)).toBeNull();
  });
});
