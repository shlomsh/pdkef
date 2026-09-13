import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import useDeletableObjects from './useDeletableObjects.js';

function Harness({ apiRef, file, bytes }) {
  apiRef.current = useDeletableObjects(file, bytes);
  return null;
}

async function buildSample() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('HELLO', { x: 20, y: 160, size: 12, font });
  return new Uint8Array(await doc.save());
}

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('useDeletableObjects', () => {
  let container;
  let apiRef;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  it('starts empty', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: undefined };
    act(() => {
      render(<Harness apiRef={apiRef} file={null} bytes={null} />, container);
    });
    expect(apiRef.current).toEqual([]);
  });

  it('populates once the file and its bytes are available', async () => {
    const bytes = await buildSample();
    const file = { name: 'sample.pdf' };
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: undefined };

    act(() => {
      render(<Harness apiRef={apiRef} file={file} bytes={bytes} />, container);
    });
    await flush();

    expect(apiRef.current.length).toBeGreaterThan(0);
    expect(apiRef.current[0].preview).toBe('HELLO');
  });

  it('does not scan without a file, even if bytes are present', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: undefined };
    act(() => {
      render(<Harness apiRef={apiRef} file={null} bytes={new Uint8Array([1])} />, container);
    });
    expect(apiRef.current).toEqual([]);
  });

  it('falls back to an empty list when the file cannot be parsed at all', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = { name: 'not-a-pdf.pdf' };
    const bytes = new Uint8Array([1, 2, 3]);
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: undefined };

    act(() => {
      render(<Harness apiRef={apiRef} file={file} bytes={bytes} />, container);
    });
    await flush();

    expect(apiRef.current).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('re-scans when the file identity changes', async () => {
    const bytesA = await buildSample();
    const docB = await PDFDocument.create();
    const pageB = docB.addPage([400, 200]);
    const fontB = await docB.embedFont(StandardFonts.Helvetica);
    pageB.drawText('SECOND', { x: 20, y: 160, size: 12, font: fontB });
    const bytesB = new Uint8Array(await docB.save());

    const fileA = { name: 'a.pdf' };
    const fileB = { name: 'b.pdf' };
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: undefined };

    act(() => {
      render(<Harness apiRef={apiRef} file={fileA} bytes={bytesA} />, container);
    });
    await flush();
    expect(apiRef.current[0].preview).toBe('HELLO');

    act(() => {
      render(<Harness apiRef={apiRef} file={fileB} bytes={bytesB} />, container);
    });
    await flush();
    expect(apiRef.current[0].preview).toBe('SECOND');
  });
});
