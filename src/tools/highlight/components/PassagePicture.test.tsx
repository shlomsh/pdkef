import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorElement } from '#editor/model/editorModel.ts';
import PassagePicture from './PassagePicture.tsx';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

const elements: EditorElement[] = [
  { id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 50, height: 5, color: '#ffd400',
    bands: [{ left: 0, top: 0, width: 100, height: 50 }, { left: 0, top: 50, width: 60, height: 50 }] },
  { id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 5, height: 5, comment: 'hi', anchor: { kind: 'element', elementId: 'h1' } } as EditorElement,
];

const ctx = { drawImage: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), scale: vi.fn(), globalAlpha: 1, globalCompositeOperation: '', fillStyle: '' };
let host: HTMLElement;
let page: HTMLElement;

beforeEach(() => {
  Object.values(ctx).forEach((f) => { if (typeof f === 'function') (f as ReturnType<typeof vi.fn>).mockClear(); });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => { act(() => render(null, host)); host.remove(); page?.remove(); vi.restoreAllMocks(); });

function fakePage() {
  page = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 1200;
  canvas.getBoundingClientRect = () => rect(0, 100, 400, 600);
  const overlay = document.createElement('div');
  overlay.setAttribute('data-page-overlay', '');
  const mark = document.createElement('div');
  mark.setAttribute('data-editor-element-id', 'h1');
  mark.getBoundingClientRect = () => rect(40, 300, 200, 30);
  overlay.appendChild(mark);
  page.append(canvas, overlay);
  document.body.appendChild(page);
}

describe('PassagePicture', () => {
  it('renders nothing without a note', () => {
    act(() => render(<PassagePicture elements={elements} noteId={null} />, host));
    expect(host.innerHTML).toBe('');
  });
  it('renders nothing when the mark node is not on the page', () => {
    act(() => render(<PassagePicture elements={elements} noteId="c1" />, host));
    expect(host.querySelector('canvas')).toBeNull();
  });
  it('draws the crop once and one band per band', () => {
    fakePage();
    act(() => render(<PassagePicture elements={elements} noteId="c1" />, host));
    const picture = host.querySelector('canvas[data-passage-picture]');
    expect(picture).not.toBeNull();
    expect(picture?.getAttribute('aria-hidden')).toBe('true');
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage.mock.calls[0].slice(1, 5)).toEqual([0, 352, 800, 156]);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });
});
