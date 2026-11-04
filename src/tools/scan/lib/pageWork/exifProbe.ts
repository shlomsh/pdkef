// The probe that tells whether a worker decodes a photo upright, as <img> shows it (SCAN-21). The corner
// editor shows the photo through an <img>, which applies its EXIF orientation on every browser; a worker
// that did not would set the corners on a sideways photo. Pure: bytes only.

/** An EXIF APP1 segment holding one tag: Orientation = 6, "turn 90 degrees clockwise to show". */
const ORIENTATION_6 = Uint8Array.of(
  0xff, 0xe1, 0x00, 0x22, // APP1, 34 bytes long
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, first IFD at 8
  0x00, 0x01, // one entry
  0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // 0x0112 Orientation, SHORT, 1, 6
  0x00, 0x00, 0x00, 0x00, // no next IFD
);

/** The JPEG with ORIENTATION_6 after its start marker and JFIF header (if it has one): a 2 x 1 image
 * becomes one shown 1 x 2. */
export function withOrientation6(jpeg: Uint8Array): Uint8Array {
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const out = new Uint8Array(jpeg.length + ORIENTATION_6.length);
  out.set(jpeg.subarray(0, at), 0);
  out.set(ORIENTATION_6, at);
  out.set(jpeg.subarray(at), at + ORIENTATION_6.length);
  return out;
}
