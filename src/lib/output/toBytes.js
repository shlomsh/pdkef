const tag = (value) => Object.prototype.toString.call(value);

/**
 * Any byte source a tool is handed (File, Blob, ArrayBuffer or a typed array / DataView) as a
 * Uint8Array. An ArrayBuffer or typed array is wrapped, not copied. The checks use
 * `Object.prototype.toString` and `ArrayBuffer.isView`, never `instanceof`, because a buffer
 * made in another realm (a File read in an iframe, a worker message, jsdom) fails `instanceof`.
 *
 * @param {File | Blob | ArrayBuffer | ArrayBufferView} input
 * @returns {Promise<Uint8Array>}
 */
export async function toBytes(input) {
  if (tag(input) === '[object Uint8Array]') return /** @type {Uint8Array} */ (input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (tag(input) === '[object ArrayBuffer]' || tag(input) === '[object SharedArrayBuffer]') {
    return new Uint8Array(/** @type {ArrayBuffer} */ (input));
  }
  if (typeof input?.arrayBuffer === 'function') return new Uint8Array(await input.arrayBuffer());
  throw new TypeError('Expected a File, Blob, ArrayBuffer or typed array.');
}
