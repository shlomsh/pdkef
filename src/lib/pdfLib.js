/**
 * `@cantoo/pdf-lib`, fetched the first time something actually has a document
 * to read or write, and never before.
 *
 * DEBT-20: one static `import { PDFDocument } from '@cantoo/pdf-lib'` anywhere
 * in an island's graph is enough to put 628 KiB raw (215 KiB brotli) in front
 * of every visitor who lands there from search, downloaded, parsed and compiled
 * before anyone has chosen a file. On most tool pages that was 80 to 90% of the
 * eager JavaScript. Every entry point that needs the real library is already
 * async, so the cost moves to the moment it is first used.
 *
 * `src/editor/adapters/pdf/pdfjsLoader.js` is the same shape for pdf.js, and
 * `src/lib/pdfLiterals.ts` covers the other half of the problem: the callers
 * that only ever wanted a colour, a rotation or a font name, and are
 * synchronous by contract so they can never await anything.
 *
 * What is memoized is the in-flight promise, not the resolved module. Merge
 * inspects a whole selection of files concurrently, so two calls easily land in
 * the same tick, and memoizing after the await lets each of them start its own
 * import. A failed import leaves `pending` set to the rejected promise, which
 * is wrong for a retry, so it is cleared on rejection: a second attempt after
 * the network comes back should be a real attempt.
 *
 * One deliberate non-caller: `src/tools/sign/useFormFieldRegions.ts` loads
 * pdf-lib inside a `Promise.all` of literal `import()` calls, and
 * `useFormFieldRegions.wiring.test.js` pairs those specifiers against the names
 * destructured from each, by position. Routing that one line through here
 * leaves the guard with a destructuring group and no specifier to check it
 * against, so it stays as it is. It was already lazy; nothing is lost.
 *
 * Guarded by `scripts/check-lazy-modules.js`, which fails the build if pdf-lib
 * turns up in any page's eager graph again.
 *
 * @type {Promise<typeof import('@cantoo/pdf-lib')> | undefined}
 */
let pending;

/** @returns {Promise<typeof import('@cantoo/pdf-lib')>} */
export function getPdfLib() {
  if (!pending) {
    pending = import('@cantoo/pdf-lib').catch((error) => {
      pending = undefined;
      throw error;
    });
  }
  return pending;
}
