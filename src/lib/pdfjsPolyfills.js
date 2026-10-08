/**
 * Built-ins pdfjs-dist 6.3 calls without a guard of its own (DEBT-42). Older
 * browsers lack them, and the first call throws (Chromium 109: the global
 * `Iterator`; Chromium 141: `Map.prototype.getOrInsertComputed`). Each one is
 * installed only when absent, so a native implementation is never replaced.
 *
 * pdf.js itself guards only `Iterator.prototype.join`, and that guard reads the
 * global `Iterator`, so the constructor is provided here too. Found by searching
 * `build/pdf.mjs` and `build/pdf.worker.mjs`; `Set.prototype.intersection` is
 * left out because every browser that has `Iterator` (our floor, browserSupport.ts)
 * already has it.
 *
 * This runs in two places: before pdf.js is imported on the main thread
 * (`loadPdfjs.js`) and as the first import of the worker (`pdfjsWorker.js`).
 * Browsers may take a plain loop over the spec algorithm; speed does not matter
 * here, so each is the shortest correct form.
 */

function define(owner, key, value) {
  if (typeof owner[key] === 'function') return;
  Object.defineProperty(owner, key, { value, writable: true, configurable: true, enumerable: false });
}

function installMapInserts(Ctor) {
  const proto = Ctor.prototype;
  define(proto, 'getOrInsert', function getOrInsert(key, value) {
    if (this.has(key)) return this.get(key);
    this.set(key, value);
    return value;
  });
  define(proto, 'getOrInsertComputed', function getOrInsertComputed(key, callback) {
    if (this.has(key)) return this.get(key);
    const value = callback(key);
    this.set(key, value);
    return value;
  });
}

function installIterator() {
  const proto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  if (typeof globalThis.Iterator !== 'function') {
    function Iterator() {}
    Iterator.prototype = proto;
    Object.defineProperty(globalThis, 'Iterator', { value: Iterator, writable: true, configurable: true, enumerable: false });
  }
  define(proto, 'join', function join(separator) {
    return [...this].join(separator);
  });
  define(proto, 'toArray', function toArray() {
    return [...this];
  });
  define(proto, 'some', function some(predicate) {
    let i = 0;
    for (const value of this) if (predicate(value, i++)) return true;
    return false;
  });
  define(proto, 'find', function find(predicate) {
    let i = 0;
    for (const value of this) if (predicate(value, i++)) return value;
    return undefined;
  });
  define(proto, 'filter', function* filter(predicate) {
    let i = 0;
    for (const value of this) if (predicate(value, i++)) yield value;
  });
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function installBytes() {
  const proto = Uint8Array.prototype;
  define(proto, 'toHex', function toHex() {
    let out = '';
    for (const byte of this) out += byte.toString(16).padStart(2, '0');
    return out;
  });
  define(proto, 'toBase64', function toBase64() {
    let out = '';
    for (let i = 0; i < this.length; i += 3) {
      const n = (this[i] << 16) | ((this[i + 1] || 0) << 8) | (this[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      out += i + 1 < this.length ? B64[(n >> 6) & 63] : '=';
      out += i + 2 < this.length ? B64[n & 63] : '=';
    }
    return out;
  });
  define(Uint8Array, 'fromBase64', function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  });
}

export function installPdfjsPolyfills() {
  installMapInserts(Map);
  installMapInserts(WeakMap);
  installIterator();
  define(Promise, 'try', function (callback, ...args) {
    return new Promise((resolve) => resolve(callback(...args)));
  });
  define(Math, 'sumPrecise', function sumPrecise(values) {
    let sum = 0;
    for (const value of values) sum += value;
    return sum;
  });
  installBytes();
}
