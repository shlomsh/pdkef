import { afterAll, afterEach, beforeAll } from 'vitest';
import { isCommonAssetRequest } from 'msw';
import { setupWorker } from 'msw/browser';
import { networkCore } from './networkCore.ts';

/**
 * The MSW service worker for `*.browser.test.*` files (LAND-04 wave 5): the same contract as
 * `network.ts` in Node, for a real `fetch`, `sendBeacon`, image or font load in Chromium. Vite's own
 * module and static-file requests to the test page's origin (pdf.js's `.wasm` codecs included, which MSW's
 * asset list leaves out) pass through to Vite unanswered; anything
 * else without a handler never leaves the machine and fails the test after it.
 */
export const worker = setupWorker();

const viteTraffic = (request: Request) => {
  const url = new URL(request.url);
  return url.origin === location.origin && (isCommonAssetRequest(request) || url.pathname.endsWith('.wasm'));
};

const core = networkCore(worker, viteTraffic);

/** The requests no handler answered since the last call, each with the test running when it arrived. */
export const missedRequests = core.missedRequests;

/**
 * Answers each `method` request to `url` with the next answer in turn, and returns the requests it saw;
 * `await seen.arrived(n)` resolves once n have come in (a beacon lands after its call returns).
 */
export const answerInTurn = core.answerInTurn;

/** Call once at the top of a test file: starts the worker for the file and resets handlers per test. */
export function answerNetwork() {
  beforeAll(() => worker.start({ onUnhandledFrame: core.refuseUnhandled, quiet: true }));
  afterEach(() => {
    worker.resetHandlers();
    core.failOnMissed();
  });
  afterAll(() => worker.stop());
}

/** The headers the code under test set on a request, lower-cased, without the accept-anything default Chromium adds itself. */
export function sentHeaders(request: Request) {
  return Object.fromEntries([...request.headers].filter(([name, value]) => !(name === 'accept' && value === '*/*')));
}
