const MARK = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/** True when `%PDF-` appears anywhere in the bytes. pdf-lib's header parse scans the whole file, so this matches it. */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const last = bytes.length - MARK.length;
  for (let i = 0; i <= last; i++) {
    let j = 0;
    while (j < MARK.length && bytes[i + j] === MARK[j]) j++;
    if (j === MARK.length) return true;
  }
  return false;
}
