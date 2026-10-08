import { afterEach, describe, expect, it } from 'vitest';
import { installPdfjsPolyfills } from './pdfjsPolyfills.js';

// Each built-in pdf.js 6.3 calls without a guard (DEBT-42). The test removes the
// native one, installs, and checks the spec behaviour; afterEach puts the native back.
const U8 = Uint8Array;
const saved = [];
function remove(owner, key) {
  saved.push([owner, key, Object.getOwnPropertyDescriptor(owner, key)]);
  delete owner[key];
}
afterEach(() => {
  while (saved.length) {
    const [owner, key, desc] = saved.pop();
    if (desc) Object.defineProperty(owner, key, desc);
    else delete owner[key];
  }
});

describe.each([
  ['Map', Map],
  ['WeakMap', WeakMap],
])('%s.prototype.getOrInsert / getOrInsertComputed', (_name, Ctor) => {
  it('is installed when absent', () => {
    remove(Ctor.prototype, 'getOrInsert');
    remove(Ctor.prototype, 'getOrInsertComputed');
    installPdfjsPolyfills();
    const m = new Ctor();
    const key = {};
    expect(m.getOrInsert(key, 1)).toBe(1);
    expect(m.getOrInsert(key, 2)).toBe(1);
    expect(m.get(key)).toBe(1);
  });

  it('calls the callback only when the key is absent, with the key', () => {
    remove(Ctor.prototype, 'getOrInsertComputed');
    installPdfjsPolyfills();
    const m = new Ctor();
    const key = {};
    let calls = 0;
    const make = (k) => (calls++, [k]);
    const first = m.getOrInsertComputed(key, make);
    expect(first).toEqual([key]);
    expect(m.getOrInsertComputed(key, make)).toBe(first);
    expect(calls).toBe(1);
  });

  it('never replaces a native one', () => {
    const sentinel = function () {};
    saved.push([Ctor.prototype, 'getOrInsertComputed', Object.getOwnPropertyDescriptor(Ctor.prototype, 'getOrInsertComputed')]);
    Object.defineProperty(Ctor.prototype, 'getOrInsertComputed', { value: sentinel, configurable: true, writable: true });
    installPdfjsPolyfills();
    expect(Ctor.prototype.getOrInsertComputed).toBe(sentinel);
  });
});

describe('Iterator', () => {
  it('provides a global Iterator whose prototype the array iterator inherits, with the helpers pdf.js calls', () => {
    const real = globalThis.Iterator;
    remove(globalThis, 'Iterator');
    installPdfjsPolyfills();
    const Iter = globalThis.Iterator;
    expect(typeof Iter).toBe('function');
    expect(Iter).not.toBe(real);
    const it = () => new Map([['a', 1], ['b', 2], ['c', 3]]).keys();
    expect(it()).toBeInstanceOf(Iter);
    expect(it().join('-')).toBe('a-b-c');
    expect(it().some((k) => k === 'b')).toBe(true);
    expect(it().some((k) => k === 'z')).toBe(false);
    expect(it().find((k) => k > 'a')).toBe('b');
    expect(it().filter((k) => k !== 'b').toArray()).toEqual(['a', 'c']);
  });

  it('adds missing helpers to a native Iterator without touching the ones it has', () => {
    const proto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
    const nativeFilter = proto.filter;
    remove(proto, 'join');
    remove(proto, 'toArray');
    installPdfjsPolyfills();
    expect([1, 2].values().join(',')).toBe('1,2');
    expect([1, 2].values().toArray()).toEqual([1, 2]);
    expect(proto.filter).toBe(nativeFilter);
  });
});

describe('Promise.try', () => {
  it('runs the function now, passes arguments, and turns a throw into a rejection', async () => {
    remove(Promise, 'try');
    installPdfjsPolyfills();
    await expect(Promise.try((a, b) => a + b, 1, 2)).resolves.toBe(3);
    await expect(Promise.try(() => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(Promise.try(() => Promise.resolve(7))).resolves.toBe(7);
  });
});

describe('Math.sumPrecise', () => {
  it('sums numbers, and is 0 for an empty list', () => {
    remove(Math, 'sumPrecise');
    installPdfjsPolyfills();
    expect(Math.sumPrecise([1, 2, 3.5])).toBe(6.5);
    expect(Math.sumPrecise([])).toBe(0);
    expect(Math.sumPrecise(new Set([4, 5]))).toBe(9);
  });
});

describe('Uint8Array base64 and hex', () => {
  it('round-trips and matches the spec output', () => {
    remove(U8.prototype, 'toBase64');
    remove(U8.prototype, 'toHex');
    remove(U8, 'fromBase64');
    installPdfjsPolyfills();
    const bytes = new U8([0, 1, 254, 255, 16]);
    expect(bytes.toHex()).toBe('0001feff10');
    expect(new U8([104, 105]).toBase64()).toBe('aGk=');
    expect(Array.from(U8.fromBase64('AAH+/xA='))).toEqual([0, 1, 254, 255, 16]);
    expect(bytes.toBase64()).toBe('AAH+/xA=');
  });
});

describe('installing twice', () => {
  it('is harmless', () => {
    remove(Map.prototype, 'getOrInsert');
    installPdfjsPolyfills();
    const installed = Map.prototype.getOrInsert;
    installPdfjsPolyfills();
    expect(Map.prototype.getOrInsert).toBe(installed);
  });
});
