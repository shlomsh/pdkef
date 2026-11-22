import { describe, expect, it } from 'vitest';
import { HttpResponse } from 'msw';
import { answerInTurn, answerNetwork, missedRequests, sentHeaders, worker } from './network.browser.ts';

answerNetwork();

const unhandledArrival = (path: string) => new Promise<void>((resolve) => {
  const arrived = ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname !== path) return;
    worker.events.removeListener('request:unhandled', arrived);
    resolve();
  };
  worker.events.on('request:unhandled', arrived);
});

describe('answerNetwork in the browser', () => {
  it('answers a real beacon, and a test waits for it to land', async () => {
    const beacons = answerInTurn('post', '/api/report', () => new HttpResponse(null, { status: 204 }));
    expect(navigator.sendBeacon('/api/report', JSON.stringify({ a: 1 }))).toBe(true);
    await beacons.arrived(1);
    expect(beacons).toHaveLength(1);
    expect(await beacons[0].text()).toBe('{"a":1}');
    expect(sentHeaders(beacons[0])).toEqual({ 'content-type': 'text/plain;charset=UTF-8' });
  });

  it('lets no unhandled request leave, cross-origin or not, a file-looking URL included', async () => {
    const otherOrigin = `${location.protocol}//127.0.0.1:${location.port}/favicon.ico`;
    const crossOrigin = await fetch(otherOrigin, { mode: 'no-cors' }).then((response) => response.type, () => 'refused');
    const beaconMissed = unhandledArrival('/api/unanswered');
    navigator.sendBeacon('/api/unanswered', 'x');
    await beaconMissed;
    expect(crossOrigin).not.toBe('opaque');
    expect(missedRequests().map((line) => line.split(' (')[0])).toEqual([`GET ${otherOrigin}`, `POST ${location.origin}/api/unanswered`]);
  });

  it('fails an awaited arrival at once when the request went to a URL nothing answers', async () => {
    const reports = answerInTurn('post', '/api/report', () => new HttpResponse(null, { status: 204 }));
    navigator.sendBeacon('/api/other', 'x');
    await expect(reports.arrived(1)).rejects.toThrow(`No handler for: POST ${location.origin}/api/other`);
    expect(missedRequests()).toHaveLength(1);
  });

  it('passes the page’s own module, font, image and pdf.js codec loads through to Vite', async () => {
    const { networkCore } = await import('./networkCore.ts');
    const codec = await fetch('/pdfjs-dist-wasm/openjpeg.wasm');
    const font = await new FontFace('Alef', `url(/fonts/Alef-Regular.ttf)`).load();
    const image = new Image();
    image.src = '/images/brand/google-drive.png';
    await image.decode();
    expect(typeof networkCore).toBe('function');
    expect(font.status).toBe('loaded');
    expect(image.naturalWidth).toBeGreaterThan(0);
    expect(codec.headers.get('content-type')).toBe('application/wasm');
    expect(missedRequests()).toEqual([]);
  });

  it('registers no service worker but MSW’s own', async () => {
    const scripts = (await navigator.serviceWorker.getRegistrations()).map((registration) => new URL(registration.active!.scriptURL).pathname);
    expect(scripts).toEqual(['/mockServiceWorker.js']);
  });
});
