import { describe, expect, it } from 'vitest';
import { answerInTurn, answerNetwork, sentHeaders } from './network.ts';

answerNetwork();

describe('sentHeaders', () => {
  it('leaves out what Node fetch adds by itself', async () => {
    const seen = answerInTurn('post', 'https://x.example/p', () => new Response('{}'));
    await fetch('https://x.example/p', { method: 'POST', body: 'abc' });
    expect(sentHeaders(seen[0])).toEqual({ 'content-type': 'text/plain;charset=UTF-8' });
  });

  it('keeps an accept and an accept-language the code set', async () => {
    const seen = answerInTurn('get', 'https://x.example/g', () => new Response('{}'));
    await fetch('https://x.example/g', { headers: { Accept: 'application/json', 'Accept-Language': 'he' } });
    expect(sentHeaders(seen[0])).toEqual({ accept: 'application/json', 'accept-language': 'he' });
  });
});
