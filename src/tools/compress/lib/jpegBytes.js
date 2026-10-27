// JPEG byte helpers. createImageBitmap applies a JPEG's EXIF orientation, PDF viewers ignore it, so
// Compress strips EXIF before decoding to keep the picture the way the PDF shows it.

const isExif = (b, at) =>
  b[at] === 0x45 && b[at + 1] === 0x78 && b[at + 2] === 0x69 && b[at + 3] === 0x66 && b[at + 4] === 0 && b[at + 5] === 0;

// Segments before SOS as { marker, start (of FF), end (exclusive) }, or null when not a JPEG or malformed.
function segmentsBeforeScan(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const out = [];
  let pos = 2;
  while (pos < b.length) {
    if (b[pos] !== 0xff) return null;
    const start = pos;
    while (b[pos] === 0xff) pos++; // fill bytes
    if (pos >= b.length) return null;
    const marker = b[pos++];
    if (marker === 0xda) return out;
    if (marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (pos + 2 > b.length) return null;
    const len = (b[pos] << 8) | b[pos + 1];
    if (len < 2 || pos + len > b.length) return null;
    out.push({ marker, start, payload: pos + 2, end: pos + len });
    pos += len;
  }
  return null;
}

const exifSegments = (b) =>
  (segmentsBeforeScan(b) ?? []).filter((s) => s.marker === 0xe1 && s.end - s.payload >= 6 && isExif(b, s.payload));

export function stripExif(bytes) {
  const segs = exifSegments(bytes);
  if (!segs.length) return bytes;
  const out = new Uint8Array(bytes.length - segs.reduce((n, s) => n + (s.end - s.start), 0));
  let at = 0;
  let from = 0;
  for (const s of segs) {
    out.set(bytes.subarray(from, s.start), at);
    at += s.start - from;
    from = s.end;
  }
  out.set(bytes.subarray(from), at);
  return out;
}

export function exifOrientation(bytes) {
  const seg = exifSegments(bytes)[0];
  if (!seg) return null;
  const t = seg.payload + 6; // TIFF header
  const end = seg.end;
  if (t + 8 > end) return null;
  const little = bytes[t] === 0x49 && bytes[t + 1] === 0x49;
  if (!little && !(bytes[t] === 0x4d && bytes[t + 1] === 0x4d)) return null;
  const u16 = (p) => (little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1]);
  const u32 = (p) =>
    little
      ? (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0
      : ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
  if (u16(t + 2) !== 42) return null;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) return null;
    if (u16(e) === 0x0112) {
      if (u16(e + 2) !== 3 || u32(e + 4) < 1) return null;
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}
