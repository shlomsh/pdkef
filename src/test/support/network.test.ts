import { describe, expect, it } from 'vitest';
import { answerInTurn, answerNetwork, missedRequests, sentHeaders } from './network.ts';

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

describe('answerNetwork', () => {
  it('lets no unhandled request through, a file-looking URL included', async () => {
    const { createServer } = await import('node:http');
    let hits = 0;
    const local = createServer((_req, res) => { hits += 1; res.end('real'); });
    await new Promise<void>((resolve) => { local.listen(0, '127.0.0.1', resolve); });
    const { port } = local.address() as { port: number };
    const answer = await fetch(`http://127.0.0.1:${port}/file.pdf`).then((response) => response.text(), () => 'refused');
    await new Promise<void>((resolve) => { local.close(() => resolve()); });
    expect(hits).toBe(0);
    expect(answer).not.toBe('real');
    expect(missedRequests()).toEqual([`GET http://127.0.0.1:${port}/file.pdf (during "answerNetwork > lets no unhandled request through, a file-looking URL included")`]);
  });
});
