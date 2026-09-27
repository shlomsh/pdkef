/** The slice of `PDFPageProxy` this module actually needs, so a caller can
 * pass the real pdf.js page with no cast. */
export interface TextStreamPage {
  streamTextContent(): {
    getReader(): { read(): Promise<{ done: boolean; value?: { items: object[] } }> };
  };
}

/**
 * Drains a pdf.js page's text stream into a flat array of its raw items,
 * in order.
 *
 * Drained with a reader rather than `getTextContent()`, which is the same
 * stream read a different way. pdf.js's `getTextContent` ends in
 * `for await (const value of readableStream)`, and async iteration of a
 * native `ReadableStream` has never shipped in Safari (WebKit bug 194379).
 * On iOS the iterator-protocol lookup finds neither `Symbol.asyncIterator`
 * nor `Symbol.iterator`, calls `undefined`, and every document detected zero
 * fields with `TypeError: undefined is not a function` - reported 2026-09-20
 * on iOS 26.6.2, in Safari and Chrome alike since both are WebKit, and
 * reproducible on no engine we can run here: Playwright's Linux WebKit is a
 * trunk build that HAS the feature (measured: `typeof
 * ReadableStream.prototype[Symbol.asyncIterator]` is `'function'` there and
 * in Chromium), which is why every local run was green.
 *
 * Rendering was never affected, and that is the tell: it drains the very
 * same stream with `getReader()` (`_pumpOperatorList`), so a device that
 * paints a page correctly could still not read a word of its text. We use
 * only the primitives that path already proves are present.
 */
export async function readTextItems(page: TextStreamPage): Promise<object[]> {
  const reader = page.streamTextContent().getReader();
  const items: object[] = [];
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    items.push(...(chunk.value?.items ?? []));
  }
  return items;
}
