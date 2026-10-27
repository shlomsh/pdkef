import { outputName } from '../../lib/outputName.ts';

// The PDF search re-encodes as JPEG-in-PDF and the image search re-encodes
// as JPEG (compressImageToTarget flattens PNG transparency to white), but a
// file already under the target passes through untouched in both cases, so
// a small PNG or an already-small PDF stays exactly what it was: name the
// download by the *output* blob's own type, never by the input's extension
// or by which half of the tool ran.
export function compressedFileName(originalName: string, outputType: string) {
  const extension = outputType === 'application/pdf' ? 'pdf' : outputType === 'image/png' ? 'png' : 'jpg';
  return outputName(originalName, { strip: 'extension', fallback: 'file', suffix: '-compressed', ext: extension });
}
