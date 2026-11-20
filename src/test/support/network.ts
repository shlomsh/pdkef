import { afterAll, afterEach, beforeAll } from 'vitest';
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

const FETCH_OWN_HEADERS = new Set(['accept', 'accept-encoding', 'accept-language', 'connection', 'host', 'sec-fetch-mode', 'user-agent']);

/** The headers the code under test set on a request, lower-cased, without the ones Node's fetch adds itself. */
export function sentHeaders(request: Request) {
  return Object.fromEntries([...request.headers].filter(([name]) => !FETCH_OWN_HEADERS.has(name)));
}
