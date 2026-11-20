import { describe, expect, it } from 'vitest';
import { HttpResponse } from 'msw';
import { answerInTurn, answerNetwork, sentHeaders } from '../test/support/network.ts';
import { RATING_MIN_VOTES, loadAppRating, ratingText, summarize } from './ratingAggregate.js';
import { RATING_TOOLS } from '#lib/telemetry/ratingSchema.ts';

const env = { KV_REST_API_URL: 'https://store.example/', KV_REST_API_TOKEN: 't' };
const hash = (c: Record<string, number>) => ({ result: Object.entries(c).flatMap(([k, v]) => [k, String(v)]) });
const reply = (perTool: Record<string, Record<string, number>>, entries: unknown[] = []) => [
  ...RATING_TOOLS.map((t) => hash(perTool[t] ?? {})),
  { result: entries },
];
const PIPELINE = 'https://store.example/pipeline';

answerNetwork();

const store = (...answers: Array<() => Response>) => answerInTurn('post', PIPELINE, ...answers);
const ok = (body: unknown) => () => HttpResponse.json(body as never);

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
    const seen = store(ok(reply({ merge: { 5: 4 }, sign: { 5: 2 }, redact: { 4: 1, 5: 15 } }, [
      '{"country":"KE"}', '{"country":"IL"}', '{"country":"IL","region":"TA"}', '{}', 'not json',
    ])));
    expect(await loadAppRating(env)).toEqual({ average: 4.95, count: 22, countries: 2 });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://store.example/pipeline');
    expect(sentHeaders(seen[0])).toEqual({ authorization: 'Bearer t', 'content-type': 'application/json' });
    expect(await seen[0].json()).toEqual([...RATING_TOOLS.map((t) => ['HGETALL', `rating:${t}`]), ['LRANGE', 'rating:entries', 0, -1]]);
  });
  it('is null under the minimum across all tools together', async () => {
    store(ok(reply({ merge: { 5: 5 }, sign: { 5: 4 } })));
    expect(await loadAppRating(env)).toBeNull();
  });
  it('is null without env, on a non-ok reply and on a throw', async () => {
    const seen = store(() => new HttpResponse(null, { status: 500 }), () => HttpResponse.error(), () => new HttpResponse('not json'));
    expect(await loadAppRating({})).toBeNull();
    expect(seen).toHaveLength(0);
    expect(await loadAppRating(env)).toBeNull();
    expect(await loadAppRating(env)).toBeNull();
    expect(await loadAppRating(env)).toBeNull();
    expect(seen).toHaveLength(3);
  });
});
