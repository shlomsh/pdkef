// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const file = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' });

describe('File and Blob equality in tests', () => {
  it('a file equals itself, on its own and inside other values', () => {
    const a = file();
    const called = vi.fn();
    called(a, { files: [a] });
    expect(called).toHaveBeenCalledWith(a, { files: [a] });
    expect(called).toHaveBeenCalledWith(a, expect.objectContaining({ files: [a] }));
    expect({ a }).toEqual({ a });
    expect({ a }).toEqual({ a: expect.any(File) });
  });

  it.each([
    ['another file', file, () => file('b.png')],
    ['a copy of the file', file, file],
    ['another blob', () => new Blob(['x']), () => new Blob(['yy'])],
  ])('%s is not equal', (_name, make, other) => {
    const called = vi.fn();
    called(make());
    expect(called).not.toHaveBeenCalledWith(other());
    expect({ value: [make()] }).not.toEqual({ value: [other()] });
    expect({ value: make() }).not.toStrictEqual({ value: other() });
    expect({ value: make() }).not.toEqual(expect.objectContaining({ value: other() }));
  });

  it('leaves other values to the usual equality', () => {
    expect({ a: [1, { b: new Uint8Array([1]) }] }).toEqual({ a: [1, { b: new Uint8Array([1]) }] });
    expect(new Map([['k', { v: 1 }]])).toEqual(new Map([['k', { v: 1 }]]));
  });
});
