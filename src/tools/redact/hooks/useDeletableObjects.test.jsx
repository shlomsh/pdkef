import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import useDeletableObjects from './useDeletableObjects.js';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';

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
    await waitUntil(() => apiRef.current.length > 0);

    expect(apiRef.current.length).toBeGreaterThan(0);
    // The scan finds the run and its box; what it says is read separately (RED-16).
    expect(apiRef.current[0].kind).toBe('text');
    expect(apiRef.current[0].preview).toBeUndefined();
  });

  it('offers the one object the num-1 fixture contains', async () => {
    const bytes = new Uint8Array(readFileSync(path.resolve(process.cwd(), 'src/lib/__fixtures__/num-1.pdf')));
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: undefined };

    act(() => {
      render(<Harness apiRef={apiRef} file={{ name: 'num-1.pdf' }} bytes={bytes} />, container);
    });
    await waitUntil(() => apiRef.current.length > 0);

    expect(apiRef.current).toHaveLength(1);
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
    // Spy-through: the real log still prints; the list emptying is the signal that the scan ended.
    const consoleSpy = vi.spyOn(console, 'error');
    const sample = await buildSample();
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: undefined };

    act(() => {
      render(<Harness apiRef={apiRef} file={{ name: 'a.pdf' }} bytes={sample} />, container);
    });
    await waitUntil(() => expect(apiRef.current).toHaveLength(1));
    act(() => {
      render(<Harness apiRef={apiRef} file={{ name: 'not-a-pdf.pdf' }} bytes={new Uint8Array([1, 2, 3])} />, container);
    });
    await waitUntil(() => expect(apiRef.current).toEqual([]));

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('Could not read deletable objects from this PDF', expect.anything());
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
    await waitUntil(() => expect(apiRef.current[0].bbox.width).toBeCloseTo(3.279 * 12, 5));

    act(() => {
      render(<Harness apiRef={apiRef} file={fileB} bytes={bytesB} />, container);
    });
    await waitUntil(() => expect(apiRef.current[0].bbox.width).toBeCloseTo(4.278 * 12, 5));
  });
});
