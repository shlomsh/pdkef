import { expect } from 'vitest';
import { http, HttpResponse, type RequestHandler, type UnhandledFrameHandle } from 'msw';

type Answer = () => Response | Promise<Response>;
type Mocker = {
  use: (...handlers: RequestHandler[]) => void;
  events: { on: (event: 'request:unhandled', listener: (args: { request: Request }) => void) => void };
};

/**
 * What the Node server and the browser worker share (LAND-04 waves 4 and 5). `ownTraffic` names the
 * requests that may reach their real destination unanswered: in the browser, Vite's own module and
 * static-file requests to the test page's origin; in Node, none. Every other unhandled request fails:
 * MSW's own "error" strategy still lets a URL that looks like a static file through to the network.
 */
export function networkCore(mocker: Mocker, ownTraffic: (request: Request) => boolean) {
  const unhandled: string[] = [];
  const during = () => `during "${expect.getState().currentTestName}"`;
  mocker.events.on('request:unhandled', ({ request }) => {
    if (!ownTraffic(request)) unhandled.push(`${request.method} ${request.url} (${during()})`);
  });

  const refuseUnhandled: UnhandledFrameHandle = ({ frame }) => {
    const request = (frame.data as { request?: Request }).request;
    if (request && ownTraffic(request)) return;
    throw new Error(`No handler for ${request ? `${request.method} ${request.url}` : 'a network frame'}`);
  };

  const missedRequests = () => unhandled.splice(0);

  const failOnMissed = () => {
    const missed = missedRequests();
    if (missed.length) throw new Error(`No handler for: ${missed.join(', ')}`);
  };

  const answerInTurn = (method: 'get' | 'post' | 'put', url: string, ...answers: Answer[]) => {
    const seen: Request[] = [];
    const waiting: Array<() => void> = [];
    mocker.use(http[method](url, ({ request }) => {
      seen.push(request.clone());
      for (const wake of waiting.splice(0)) wake();
      const next = answers[seen.length - 1];
      if (next) return next();
      unhandled.push(`${request.method} ${request.url} (request ${seen.length}, ${answers.length} answered, ${during()})`);
      return HttpResponse.error();
    }));
    const arrived = (count: number) => new Promise<void>((resolve) => {
      const check = () => { if (seen.length >= count) resolve(); else waiting.push(check); };
      check();
    });
    return Object.assign(seen, { arrived });
  };

  return { refuseUnhandled, missedRequests, failOnMissed, answerInTurn };
}
