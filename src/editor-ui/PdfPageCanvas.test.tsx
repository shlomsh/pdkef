import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import PdfPageCanvas from './PdfPageCanvas.tsx';

function makePdfDocument() {
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: 100 * scale,
    height: 200 * scale,
  }));
  const cancel = vi.fn();
  const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel }));
  const page = {
    getViewport,
    render: renderPage,
    rotate: 0,
    cleanup: vi.fn(),
  };
  const pdfDocument = {
    getPage: vi.fn(async () => page),
  };
  return { pdfDocument, page, getViewport, renderPage, cancel };
}

describe('PdfPageCanvas', () => {
  let container: HTMLDivElement | null;
  let originalGetContext: PropertyDescriptor | undefined;

  beforeEach(() => {
    // jsdom has no real canvas backend (getContext('2d') is unimplemented);
    // stub it so the render path actually runs, the same way
    // PdfSignTool.test.tsx mocks it for its live-preview effect.
    originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({}) as unknown as CanvasRenderingContext2D),
    });
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container as any));
      container.remove();
      container = null;
    }
    if (originalGetContext) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext);
    } else {
      Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
    }
  });

  function mount(vnode: Parameters<typeof render>[0]): void {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(vnode, container as any));
  }

  it('renders at the default scale of 1.5 when renderScale is omitted', async () => {
    const { pdfDocument, getViewport, renderPage } = makePdfDocument();

    await act(async () => {
      mount(<PdfPageCanvas pdfDocument={pdfDocument as any} pageNum={1} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getViewport).toHaveBeenCalledWith(expect.objectContaining({ scale: 1.5 }));
    expect(renderPage).toHaveBeenCalledTimes(1);
  });

  it('honours a renderScale prop', async () => {
    const { pdfDocument, getViewport, renderPage } = makePdfDocument();

    await act(async () => {
      mount(<PdfPageCanvas pdfDocument={pdfDocument as any} pageNum={1} renderScale={3} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getViewport).toHaveBeenCalledWith(expect.objectContaining({ scale: 3 }));
    expect(renderPage).toHaveBeenCalledTimes(1);
  });

  it('re-renders with a new scale and cancels the previous task when renderScale changes', async () => {
    const { pdfDocument, getViewport, renderPage, cancel } = makePdfDocument();

    await act(async () => {
      mount(<PdfPageCanvas pdfDocument={pdfDocument as any} pageNum={1} renderScale={1.5} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getViewport).toHaveBeenCalledWith(expect.objectContaining({ scale: 1.5 }));
    expect(renderPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      render(
        <PdfPageCanvas pdfDocument={pdfDocument as any} pageNum={1} renderScale={2.25} />,
        container as any,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getViewport).toHaveBeenCalledWith(expect.objectContaining({ scale: 2.25 }));
    expect(renderPage).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
