import { describe, expect, it } from 'vitest';
import { mapFrame, parseArgs, parseFrame, parseFrames, wrapperConfigText } from './errors-resolve.mjs';

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
    expect(parseArgs(['a.js:1:2', '--max', '3'])).toEqual({ frames: ['a.js:1:2'], max: 3 });
    expect(parseArgs(['a.js:1:2']).max).toBe(40);
  });
  it('collects several frames with --max anywhere', () => {
    expect(parseArgs(['a.js:1:2', '--max', '5', 'b.js:3:4', 'c.js:5:6'])).toEqual({ frames: ['a.js:1:2', 'b.js:3:4', 'c.js:5:6'], max: 5 });
    expect(parseArgs(['--max', '2', 'a.js:1:2', 'b.js:3:4']).frames).toHaveLength(2);
  });
});

describe('parseFrames', () => {
  it('parses all frames in order', () => {
    expect(parseFrames(['a.js:1:2', 'b.js:3:4']).frames).toEqual([{ chunk: 'a.js', line: 1, col: 2 }, { chunk: 'b.js', line: 3, col: 4 }]);
  });
  it('rejects one bad frame among good ones with a one-line message', () => {
    const r = parseFrames(['a.js:1:2', 'oops', 'c.js:5:6']);
    expect(r.frames).toBeUndefined();
    expect(r.error).toContain('#2');
    expect(r.error).toContain('oops');
    expect(r.error).not.toContain('\n');
  });
  it('rejects no frames', () => {
    expect(parseFrames([]).error).toBeTruthy();
  });
});
