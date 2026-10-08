import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { installPdfjsPolyfills } from './pdfjsPolyfills.js';

// DEBT-42: delete a built-in pdf.js 6.3 calls on the way to a rendered page, then prove pdf.js cannot open and render
// a page without the polyfill and can with it. Node runs pdf.js's worker in-process (the
// "fake worker"), so one realm covers both sides. pdf.js reads `Iterator` at module load
// and Node caches ESM by URL, so every attempt imports a fresh `?case=n` copy of both the
// library and the worker (vi.resetModules does not reach externalized node_modules).
const require = createRequire(import.meta.url);
const BUILD = path.dirname(require.resolve('pdfjs-dist/build/pdf.mjs'));
const FIXTURE = path.resolve(__dirname, '__fixtures__/three-page-header.pdf');
const STANDARD_FONTS = `${path.join(BUILD, '..', 'standard_fonts')}/`;
const WORKER_URL = pathToFileURL(path.join(BUILD, 'pdf.worker.mjs')).href;

// pdf.js's non-legacy build paints with the browser's canvas globals; in Node they come
// from @napi-rs/canvas, which pdf.js's own canvas factory already uses.
const napiCanvas = require('@napi-rs/canvas');
for (const name of ['Path2D', 'DOMMatrix', 'ImageData']) globalThis[name] ??= napiCanvas[name];

let attempt = 0;

// Open the fixture and paint page 1 in a fresh pdf.js instance, on @napi-rs/canvas.
async function openAndRender() {
  const n = ++attempt;
  const pdfjs = await import(/* @vite-ignore */ `${pathToFileURL(path.join(BUILD, 'pdf.mjs')).href}?case=${n}`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${WORKER_URL}?case=${n}`;
  // stopAtErrors: pdf.js otherwise logs a failed font as a warning and the render never ends,
  // so a missing built-in would read as a timeout instead of naming itself.
  const task = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(FIXTURE)),
    standardFontDataUrl: STANDARD_FONTS,
    stopAtErrors: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const ops = await page.getOperatorList();
    const text = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const { context } = pdf.canvasFactory.create(viewport.width, viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return { pages: pdf.numPages, ops: ops.fnArray.length, text: text.items.length };
  } finally {
    await task.destroy();
  }
}

// How long a control waits before calling the render hung, and how fast every polyfilled
// run must be: a cold open and paint takes 0.1-0.4s here, so a hang cannot be a slow runner.
const HANG_MS = 3000;
const RENDERS_WITHIN_MS = 1500;
const HUNG = 'timed out';

// The built-ins opening and rendering this fixture reaches, each with the failure pdf.js
// shows without it: an error naming it, or (transferToFixedLength, a font failing inside
// the worker) a render that never finishes. Each control deletes only its own one.
// pdf.js calls the rest of what installPdfjsPolyfills() provides only on other paths
// (Map.getOrInsert, WeakMap getOrInsert/getOrInsertComputed, the Iterator helpers
// join/toArray/some/find/filter, Math.sumPrecise, Uint8Array toBase64/fromBase64, URL.parse,
// Response.prototype.bytes); pdfjsPolyfills.test.js covers each of those on its own.
const ROWS = [
  ['globalThis.Iterator', globalThis, 'Iterator', 'Iterator is not defined'],
  ['Map.prototype.getOrInsertComputed', Map.prototype, 'getOrInsertComputed', '.getOrInsertComputed is not a function'],
  ['Promise.try', Promise, 'try', 'Promise.try is not a function'],
  ['Promise.withResolvers', Promise, 'withResolvers', 'Promise.withResolvers is not a function'],
  ['Uint8Array.prototype.toHex', Uint8Array.prototype, 'toHex', '.toHex is not a function'],
  ['ArrayBuffer.prototype.transferToFixedLength', ArrayBuffer.prototype, 'transferToFixedLength', HUNG],
];

// installPdfjsPolyfills() leaves its built-ins behind, so every test puts each row's built-in
// back to the runtime's own state: otherwise one row's install would mask the next control.
const ORIGINALS = ROWS.map(([, owner, key]) => [owner, key, Object.getOwnPropertyDescriptor(owner, key)]);
function resetBuiltins() {
  for (const [owner, key, original] of ORIGINALS) {
    if (original) Object.defineProperty(owner, key, original);
    else delete owner[key];
  }
}

// pdf.js can throw inside its own message handler, which surfaces as an unhandled rejection
// rather than a rejected open. Catch those here so the control can read them (and Vitest
// does not report them as a stray error), then hand the listeners back.
async function failureOf(run) {
  const saved = process.listeners('unhandledRejection');
  const stray = [];
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (e) => stray.push(e));
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(HUNG)), HANG_MS));
    const error = await Promise.race([run(), timeout]).then(() => null, (e) => e);
    await new Promise((r) => setTimeout(r, 50));
    // A stray rejection is the real cause when the open itself only timed out.
    return stray[0] ?? error;
  } finally {
    process.removeAllListeners('unhandledRejection');
    saved.forEach((l) => process.on('unhandledRejection', l));
  }
}

// Only the row's own built-in may be missing: Node lacks some of them natively (toHex on
// Node 24), and a control that fails on another one proves nothing about its own row.
function withOnlyMissing(owner, key) {
  installPdfjsPolyfills();
  delete owner[key];
}

describe.each(ROWS)('pdf.js without %s', (label, owner, key, failure) => {
  afterEach(resetBuiltins);

  it('control: fails to open and render with no polyfill', async () => {
    withOnlyMissing(owner, key);
    // Some built-ins fail the open itself; for Promise.try the worker's reply never settles
    // and the error only surfaces as an unhandled rejection. Either way it must name the
    // missing built-in, and only a row that hangs may end in the timeout.
    const error = await failureOf(openAndRender);
    expect(String(error?.message)).toContain(failure);
  });

  it('opens and renders once the polyfill is installed', async () => {
    withOnlyMissing(owner, key);
    installPdfjsPolyfills();
    const started = performance.now();
    expect(await openAndRender()).toMatchObject({ pages: 3, ops: expect.any(Number) });
    expect(performance.now() - started).toBeLessThan(RENDERS_WITHIN_MS);
  });
});
