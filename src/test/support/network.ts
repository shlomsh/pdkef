import { afterAll, afterEach, beforeAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * The one MSW server for tests whose code under test calls `fetch` (LAND-04 wave 4). The real module
 * runs and makes its real request; a handler answers it. A request with no handler fails the test:
 * MSW turns it into a network error, which code that maps "offline" would otherwise swallow, so the
 * unhandled request is also recorded and thrown after the test.
 */
export const server = setupServer();

const unhandled: string[] = [];
server.events.on('request:unhandled', ({ request }) => {
  unhandled.push(`${request.method} ${request.url}`);
});

/** Call once at the top of a test file: starts the server for the file and resets handlers per test. */
export function answerNetwork() {
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    const missed = unhandled.splice(0);
    if (missed.length) throw new Error(`No handler for: ${missed.join(', ')}`);
  });
  afterAll(() => server.close());
}

type Answer = () => Response | Promise<Response>;

/**
 * Answers each `method` request to `url` (exact, or an MSW path pattern such as `/files/:id`) with the next
 * answer in turn, and returns the requests it saw, cloned so a test can read their bodies afterwards. A
 * request beyond the last answer fails the test the way an unhandled one does.
 */
export function answerInTurn(method: 'get' | 'post' | 'put', url: string, ...answers: Answer[]) {
  const seen: Request[] = [];
  server.use(http[method](url, ({ request }) => {
    seen.push(request.clone());
    const next = answers[seen.length - 1];
    if (next) return next();
    unhandled.push(`${request.method} ${request.url} (request ${seen.length}, ${answers.length} answered)`);
    return HttpResponse.error();
  }));
  return seen;
}

const SET_BY_NODE_FETCH = new Set(['accept', 'accept-encoding', 'accept-language', 'connection', 'content-length', 'host', 'sec-fetch-mode', 'user-agent']);

/** The headers the code under test set on a request, lower-cased, without the ones Node's fetch adds itself (content-length included: a forbidden header the code cannot set). */
export function sentHeaders(request: Request) {
  return Object.fromEntries([...request.headers].filter(([name]) => !SET_BY_NODE_FETCH.has(name)));
}
