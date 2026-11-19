// @vitest-environment jsdom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useDeleteTool, { type UseDeleteToolResult } from './useDeleteTool.ts';
import { PDFDocument } from '@cantoo/pdf-lib';
import { waitUntil } from '../../../test/support/waitUntil.ts';

// A real five-page PDF that draws one embedded picture on every page: the logo the hook finds for itself.
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
async function logoOnEveryPage(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0)));
  for (let i = 0; i < 5; i += 1) doc.addPage([200, 200]).drawImage(png, { x: 10, y: 10, width: 20, height: 20 });
  const saved = await doc.save();
  return saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
}

describe('useDeleteTool: the same image on other pages', () => {
  let container: HTMLDivElement;
  afterEach(() => { act(() => { render(null, container); }); container.remove(); });

  // Mounts the hook on the real file; resolves once it has found the logo on all five pages.
  async function mountOnLogoPdf() {
    container = document.createElement('div');
    const fileBytes = await logoOnEveryPage();
    const file = new File([fileBytes], 'logo.pdf', { type: 'application/pdf' });
    const pdfDocument = {} as never; // identity only: the logo is a picture, so no page text is read from it
    let tool!: UseDeleteToolResult;
    const add = vi.fn();
    function Harness() {
      tool = useDeleteTool({
        elements: [], file, fileBytes, pdfDocument,
        pageWrapperRefs: { current: [] }, add, announce: () => {}, disarmTool: () => {},
      });
      return null;
    }
    act(() => { render(h(Harness, {}), container); });
    await waitUntil(() => tool.deletableObjects.length === 5);
    return { get tool() { return tool; }, add };
  }

  it('offers Every page, which adds one entry for pages 2-5', async () => {
    const mounted = await mountOnLogoPdf();
    const logo = mounted.tool.deletableObjects.find((o) => o.pageIndex === 0)!;

    act(() => { mounted.tool.markObject(logo); });
    expect(mounted.add).toHaveBeenCalledTimes(1);
    const [first, firstOptions] = mounted.add.mock.calls[0];
    expect(first).toHaveLength(1);
    expect(firstOptions.description).toBe('Deleted an image');
    expect(firstOptions.chipMessage).toBe('Deleted an image, also on 4 other pages');
    expect(firstOptions.undoExtra.label).toBe('Every page');

    act(() => { firstOptions.undoExtra.onSelect(); });
    expect(mounted.add).toHaveBeenCalledTimes(2);
    const [rest, restOptions] = mounted.add.mock.calls[1];
    expect(rest.map((e: { pageIndex: number }) => e.pageIndex)).toEqual([1, 2, 3, 4]);
    expect(restOptions.description).toBe('Deleted the image on every page');
    expect(restOptions.undoExtra).toBeUndefined();
  });

  it('offers nothing for a drag over several objects', async () => {
    const mounted = await mountOnLogoPdf();
    const [a, b] = mounted.tool.deletableObjects;
    act(() => { mounted.tool.markObjects([a, b]); });
    expect(mounted.add.mock.calls[0][1].undoExtra).toBeUndefined();
  });
});
