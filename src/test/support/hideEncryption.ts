/**
 * The same encrypted file with an empty revision appended whose trailer leaves /Encrypt out. pdf.js reads the
 * newest trailer and opens it as a plain file, pdf-lib keeps the older trailer's /Encrypt and refuses it, so the
 * encryption check says open and the build itself meets the protection.
 */
export function hideEncryption(encrypted: Uint8Array): Uint8Array<ArrayBuffer> {
  const text = new TextDecoder('latin1').decode(encrypted);
  const last = (pattern: RegExp) => {
    const found = [...text.matchAll(pattern)].at(-1);
    if (!found) throw new Error(`the file has no ${pattern.source}`);
    return found[1];
  };
  const trailer = `/Size ${last(/\/Size (\d+)/g)} /Root ${last(/\/Root (\d+ \d+ R)/g)} /Prev ${last(/startxref\s+(\d+)/g)}`;
  const revision = `\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< ${trailer} >>\nstartxref\n${encrypted.length + 1}\n%%EOF\n`;
  const tail = new TextEncoder().encode(revision);
  const bytes = new Uint8Array(encrypted.length + tail.length);
  bytes.set(encrypted);
  bytes.set(tail, encrypted.length);
  return bytes;
}
