/**
 * Real PDFs for the Compress island test (ARCH-78), built with pdf-lib, so the real `analyzePdf` reads
 * them instead of a hand-built analysis: how many pages, whether an image is drawn and what share of the
 * file the image streams are, whether any page shows text.
 */
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';

export interface AnalysisSpec {
  pages: number;
  /** Share of the file's bytes taken by image streams (0 = no image at all). */
  imageShare: number;
  /** A page shows text. */
  text: boolean;
}

/** What each shape reads back as: `pictures` 90% images with text, `scan` all image, no text, `mixed` 12% images, `textOnly` no image, `single` one page of pictures. */
export const ANALYSIS_SHAPES = {
  pictures: { pages: 3, imageShare: 0.9, text: true },
  scan: { pages: 3, imageShare: 1, text: false },
  mixed: { pages: 3, imageShare: 0.12, text: true },
  textOnly: { pages: 3, imageShare: 0, text: true },
  single: { pages: 1, imageShare: 0.9, text: true },
} as const satisfies Record<string, AnalysisSpec>;
export type AnalysisShape = keyof typeof ANALYSIS_SHAPES;

const IMAGE_BYTES = 30_000;

async function build({ pages, text }: Omit<AnalysisSpec, 'imageShare'>, imageBytes: number, padBytes: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const sheets = Array.from({ length: pages }, () => doc.addPage([612, 792]));
  if (text) sheets[0].drawText('Quarterly report', { x: 50, y: 700, size: 12 });
  if (imageBytes > 0) {
    const image = doc.context.stream(new Uint8Array(imageBytes), {
      Type: 'XObject', Subtype: 'Image', Width: 300, Height: 100, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
    });
    sheets[0].node.newXObject('Im1', doc.context.register(image));
  }
  // Filler that is neither an image nor text: it only sets the image's share of the file.
  if (padBytes > 0) doc.context.register(doc.context.stream(new Uint8Array(padBytes), { Type: PDFName.of('Filler') }));
  return doc.save({ useObjectStreams: false });
}

/** A PDF of the given shape; the image share lands within a fraction of a percent of the spec. */
export async function buildAnalysisPdf(spec: AnalysisSpec): Promise<Uint8Array> {
  const { imageShare, ...rest } = spec;
  if (imageShare === 0) return build(rest, 0, 0);
  // All image: the image dwarfs the few hundred bytes of structure.
  if (imageShare >= 1) return build(rest, 200_000, 0);
  const bare = await build(rest, IMAGE_BYTES, 0);
  let pad = Math.max(0, Math.round(IMAGE_BYTES / imageShare - bare.byteLength));
  let bytes = await build(rest, IMAGE_BYTES, pad);
  // The filler's own dictionary shifts the total by a few bytes; one correction pass lands it.
  pad = Math.max(0, pad + Math.round(IMAGE_BYTES / imageShare - bytes.byteLength));
  bytes = await build(rest, IMAGE_BYTES, pad);
  return bytes;
}
