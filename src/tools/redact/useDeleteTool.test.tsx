// @vitest-environment jsdom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useDeleteTool, { type UseDeleteToolResult } from './useDeleteTool.ts';
import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';

const logo = (id: string, pageIndex: number): DeletablePdfObject =>
  ({ id, pageIndex, kind: 'image', imageRef: '5 0 R', rect: { left: 1, top: 2, width: 3, height: 4 }, start: 0, end: 1 });
const objects = [0, 1, 2, 3, 4].map((p) => logo(`logo-${p}`, p));

vi.mock('./useDeletableObjects.js', () => ({ default: () => objects }));
vi.mock('./useDeletePreviews.ts', () => ({ default: () => new Map() }));

describe('useDeleteTool: the same image on other pages', () => {
  let container: HTMLDivElement;
  afterEach(() => { act(() => { render(null, container); }); container.remove(); });

  it('offers Every page, which adds one entry for pages 2-5', () => {
    container = document.createElement('div');
    let tool!: UseDeleteToolResult;
    const add = vi.fn();
    function Harness() {
      tool = useDeleteTool({
        elements: [], file: null, fileBytes: null, pdfDocument: null,
        pageWrapperRefs: { current: [] }, add, announce: () => {}, disarmTool: () => {},
      });
      return null;
    }
    act(() => { render(h(Harness, {}), container); });

    act(() => { tool.markObject(objects[0]); });
    expect(add).toHaveBeenCalledTimes(1);
    const [first, firstOptions] = add.mock.calls[0];
    expect(first).toHaveLength(1);
    expect(firstOptions.description).toBe('Deleted an image');
    expect(firstOptions.chipMessage).toBe('Deleted an image, also on 4 other pages');
    expect(firstOptions.undoExtra.label).toBe('Every page');

    act(() => { firstOptions.undoExtra.onSelect(); });
    expect(add).toHaveBeenCalledTimes(2);
    const [rest, restOptions] = add.mock.calls[1];
    expect(rest.map((e: { pageIndex: number }) => e.pageIndex)).toEqual([1, 2, 3, 4]);
    expect(restOptions.description).toBe('Deleted the image on every page');
    expect(restOptions.undoExtra).toBeUndefined();
  });

  it('offers nothing for a drag over several objects', () => {
    container = document.createElement('div');
    let tool!: UseDeleteToolResult;
    const add = vi.fn();
    function Harness() {
      tool = useDeleteTool({
        elements: [], file: null, fileBytes: null, pdfDocument: null,
        pageWrapperRefs: { current: [] }, add, announce: () => {}, disarmTool: () => {},
      });
      return null;
    }
    act(() => { render(h(Harness, {}), container); });
    act(() => { tool.markObjects([objects[0], objects[1]]); });
    expect(add.mock.calls[0][1].undoExtra).toBeUndefined();
  });
});
