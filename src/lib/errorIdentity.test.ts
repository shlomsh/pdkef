import { describe, expect, it } from 'vitest';
import { errorName, topFrame } from './errorIdentity.ts';

describe('errorName', () => {
  it('uses the declared name, then the constructor, else Error', () => {
    expect(errorName(new TypeError('x'))).toBe('TypeError');
    class PdfLibThing extends Error {}
    expect(errorName(new PdfLibThing('x'))).toBe('PdfLibThing');
    const odd = new Error('x');
    odd.name = 'has spaces';
    expect(errorName(odd)).toBe('Error');
  });
});

describe('topFrame', () => {
  it('keeps only the first built-asset frame', () => {
    const e = new Error('x');
    e.stack = 'Error: x\n at a (https://pdkef.com/other.js:1:1)\n at b (https://pdkef.com/_astro/A.1b.js:3:4)';
    expect(topFrame(e)).toBe('A.1b.js:3:4');
  });
  it('never reads a frame out of a V8 message, even one spanning lines', () => {
    const e = new TypeError("Cannot read 'x\n /_astro/Patient diagnosis.js:1:1'");
    e.stack = `${String(e)}\n    at f (https://pdkef.com/_astro/Real.9z.js:5:6)`;
    expect(topFrame(e)).toBe('Real.9z.js:5:6');
    e.stack = String(e);
    expect(topFrame(e)).toBe('');
  });
  it('is empty with no stack or no matching frame', () => {
    const e = new Error('x');
    e.stack = undefined;
    expect(topFrame(e)).toBe('');
    e.stack = 'Error\n at chrome-extension://abc/content.js:1:2';
    expect(topFrame(e)).toBe('');
  });
});
