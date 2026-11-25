const isBlob = (value: unknown) => /^\[object (Blob|File)\]$/.test(Object.prototype.toString.call(value));

/**
 * `toEqual` and `toHaveBeenCalledWith` compare own properties, and a jsdom File has none to compare, so any two
 * Files (or two Blobs) counted as equal, whatever their names or bytes. Each equals only itself here.
 */
export function sameFile(a: unknown, b: unknown): boolean | undefined {
  return isBlob(a) || isBlob(b) ? a === b : undefined;
}
