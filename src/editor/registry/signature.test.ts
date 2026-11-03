import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { drawElements } from '../export/drawElements.ts';
import type { EditorElement, SignatureElement } from '../model/editorModel.ts';

/** A solid-colour RGB PNG, `size` pixels square. */
function solidPng(size: number, [r, g, b]: number[]): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
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
  const image = xobjects.lookup(xobjects.keys()[0], PDFRawStream);
  const pixel = [...inflateSync(image.getContents()).subarray(0, 3)];
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
