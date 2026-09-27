/**
 * Pins `readTextItems` to draining `streamTextContent()` with a reader, never
 * `getTextContent()` - see the module docstring for why (WebKit bug 194379).
 */
import { describe, expect, it, vi } from 'vitest';
import { readTextItems } from './pdfTextItems.ts';

function fakePage(chunks: object[][]) {
  let index = 0;
  const getTextContent = vi.fn(() => {
    throw new Error('getTextContent must never be called');
  });
  return {
    getTextContent,
    streamTextContent: () => ({
      getReader: () => ({
        read: async () => {
          if (index >= chunks.length) return { done: true, value: undefined };
          const value = { items: chunks[index] };
          index += 1;
          return { done: false, value };
        },
      }),
    }),
  };
}

describe('readTextItems', () => {
  it('concatenates items from every chunk in order', async () => {
    const page = fakePage([[{ str: 'a' }, { str: 'b' }], [{ str: 'c' }]]);
    const items = await readTextItems(page);
    expect(items).toEqual([{ str: 'a' }, { str: 'b' }, { str: 'c' }]);
    expect(page.getTextContent).not.toHaveBeenCalled();
  });
});
