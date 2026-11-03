import { describe, expect, it, vi } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { drawElements } from '../export/drawElements.ts';
import type { EditorElement, SignatureElement } from '../model/editorModel.ts';

/** A solid-colour RGB PNG, `size` pixels square. Its zlib stream uses stored (uncompressed) blocks, so it stays synchronous. */
function solidPng(size: number, [r, g, b]: number[]): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const concat = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  };
  const u32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
  const chunk = (type: string, data: Uint8Array) => {
    const body = concat([new TextEncoder().encode(type), data]);
    return concat([u32(data.length), body, u32(crc(body))]);
  };
  const adler32 = (bytes: Uint8Array) => {
    let a = 1;
    let b = 0;
    for (const byte of bytes) {
      a = (a + byte) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  };
  // One stored deflate block (the scanlines here are far below its 65535-byte limit) in a zlib wrapper.
  const zlibStored = (raw: Uint8Array) =>
    concat([
      new Uint8Array([0x78, 0x01, 0x01, raw.length & 0xff, raw.length >>> 8, ~raw.length & 0xff, (~raw.length >>> 8) & 0xff]),
      raw,
      u32(adler32(raw)),
    ]);
  const header = concat([u32(size), u32(size), new Uint8Array([8, 2, 0, 0, 0])]);
  const row = new Uint8Array([0, ...Array.from({ length: size }, () => [r, g, b]).flat()]);
  const png = concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibStored(concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', new Uint8Array(0)),
  ]);
  return `data:image/png;base64,${btoa(String.fromCharCode(...png))}`;
}

/** Inflates a zlib stream with the web DecompressionStream. */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const BLACK_INK = solidPng(2, [0, 0, 0]);

// The canvas tint is the one edge: this stand-in repaints the whole image in the requested colour.
vi.mock('../text/imageTint.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../text/imageTint.js')>()),
  tintImageDataUrl: async (_dataUrl: string, hex: string) => solidPng(2, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))),
}));

const signature = (overrides: Partial<SignatureElement> = {}): SignatureElement => ({
  id: 'sig', type: 'signature', pageIndex: 0, left: 10, top: 20, width: 30, height: 10, dataUrl: BLACK_INK, ...overrides,
});

/** Draws the elements on a letter page and reads the image back: where pdf.js paints it, and the pixel the file stores. */
async function drawAndReadBack(elements: EditorElement[]) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  await drawElements(doc, elements, {});
  const bytes = new Uint8Array(await doc.save());

  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: bytes.slice(), useWorkerFetch: false, isEvalSupported: false } as Parameters<typeof getDocument>[0]).promise;
  const { fnArray, argsArray } = await (await pdf.getPage(1)).getOperatorList();
  type Matrix = number[];
  const times = (m: Matrix, n: Matrix): Matrix => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const saved: Matrix[] = [];
  let painted: Matrix | undefined;
  fnArray.forEach((fn, i) => {
    if (fn === OPS.save) saved.push(ctm);
    else if (fn === OPS.restore) ctm = saved.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = times(ctm, argsArray[i] as Matrix);
    else if (fn === OPS.paintImageXObject) painted = ctm;
  });
  // The image is drawn in the unit square, so the matrix is the rectangle: [width 0 0 height x y].
  const [width, , , height, x, y] = painted!;

  const out = await PDFDocument.load(bytes);
  const xobjects = out.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
  const image = xobjects.lookup(xobjects.keys()[0]);
  if (!(image instanceof PDFRawStream)) throw new Error('expected the image XObject to be a raw stream');
  const pixel = [...(await inflate(image.getContents())).subarray(0, 3)];
  return { rect: { x, y, width, height }, pixel };
}

describe('signature serialize', () => {
  it('draws the image at the element\'s box on the page: width and height in points, y measured up from the bottom edge', async () => {
    const { rect } = await drawAndReadBack([signature()]);
    // 612 x 792 page: 30% of the width, 10% of the height, top edge 20% down.
    expect(rect.width).toBeCloseTo(183.6, 3);
    expect(rect.height).toBeCloseTo(79.2, 3);
    expect(rect.x).toBeCloseTo(61.2, 3);
    expect(rect.y).toBeCloseTo(792 - 158.4 - 79.2, 3);
  });

  it('stores the signature recoloured when it carries a colour, and untouched when it is black or has none', async () => {
    expect((await drawAndReadBack([signature({ color: '#1463ff' })])).pixel).toEqual([0x14, 0x63, 0xff]);
    expect((await drawAndReadBack([signature({ color: '#000000' })])).pixel).toEqual([0, 0, 0]);
    expect((await drawAndReadBack([signature()])).pixel).toEqual([0, 0, 0]);
  });
});
