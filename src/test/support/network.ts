import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { networkCore } from './networkCore.ts';

/**
 * The one MSW server for tests whose code under test calls `fetch` in Node (LAND-04 wave 4). The real
 * module runs and makes its real request; a handler answers it. A request with no handler never leaves
 * the machine and fails the test after it, because code that maps "offline" would otherwise swallow it.
 */
export const server = setupServer();

const core = networkCore(server, () => false);

/** The requests no handler answered since the last call, each with the test running when it arrived. */
export const missedRequests = core.missedRequests;

/**
 * Answers each `method` request to `url` (exact, or an MSW path pattern such as `/files/:id`) with the next
 * answer in turn, and returns the requests it saw, cloned so a test can read their bodies afterwards;
 * `seen.arrived(n)` resolves once n have come in. A request beyond the last answer fails the test.
 */
export const answerInTurn = core.answerInTurn;

/** Call once at the top of a test file: starts the server for the file and resets handlers per test. */
export function answerNetwork() {
  beforeAll(() => server.listen({ onUnhandledFrame: core.refuseUnhandled }));
  afterEach(() => {
    server.resetHandlers();
    core.failOnMissed();
  });
  afterAll(() => server.close());
}

const SET_BY_NODE_FETCH = new Set(['accept-encoding', 'connection', 'content-length', 'host', 'sec-fetch-mode', 'user-agent']);
const NODE_FETCH_DEFAULTS: Record<string, string> = { accept: '*/*', 'accept-language': '*' };

/**
 * The headers the code under test set on a request, lower-cased, without the ones Node's fetch adds itself:
 * the transport ones it always sets (content-length, host, user-agent and the rest), and accept / accept-language only at their defaults.
 */
export function sentHeaders(request: Request) {
  return Object.fromEntries([...request.headers].filter(([name, value]) => !SET_BY_NODE_FETCH.has(name) && NODE_FETCH_DEFAULTS[name] !== value));
}
