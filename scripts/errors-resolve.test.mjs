import { describe, expect, it } from 'vitest';
import { mapFrame, parseArgs, parseFrame, wrapperConfigText } from './errors-resolve.mjs';

describe('parseFrame', () => {
  it('parses chunk:line:col', () => {
    expect(parseFrame('PdfSignTool.Ab12Cd.js:12:345')).toEqual({ chunk: 'PdfSignTool.Ab12Cd.js', line: 12, col: 345 });
  });
  it('rejects junk', () => {
    expect(parseFrame('https://x/a.js:1:2')).toBeNull();
    expect(parseFrame('a.js:1')).toBeNull();
    expect(parseFrame(undefined)).toBeNull();
  });
});

describe('wrapperConfigText', () => {
  it('merges hidden sourcemaps over the base config', () => {
    const t = wrapperConfigText();
    expect(t).toContain("./astro.config.mjs");
    expect(t).toContain('sourcemap: "hidden"');
    expect(t).toContain('preserveSymlinks: true');
  });
});

describe('mapFrame', () => {
  // "AAAA" maps generated 1:0 to a.ts 1:0; "AACA,CAAM" adds a segment at col 1 -> source line 2 col 6? keep simple.
  const map = { version: 3, sources: ['a.ts'], names: ['foo'], mappings: 'AAAAA,IAAIA', file: 'x.js' };
  it('treats the column as 1-based and returns a 1-based source column', () => {
    expect(mapFrame(map, 1, 1)).toMatchObject({ source: 'a.ts', line: 1, column: 1, name: 'foo' });
    expect(mapFrame(map, 1, 6)).toMatchObject({ source: 'a.ts', line: 1, column: 5 });
  });
  it('returns null when nothing maps', () => {
    expect(mapFrame(map, 9, 1)).toBeNull();
  });
});

describe('parseArgs', () => {
  it('reads --max', () => {
    expect(parseArgs(['a.js:1:2', '--max', '3'])).toEqual({ frame: 'a.js:1:2', max: 3 });
    expect(parseArgs(['a.js:1:2']).max).toBe(40);
  });
});
