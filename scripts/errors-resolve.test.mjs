import { describe, expect, it } from 'vitest';
import { buildMissMessage, candidateShas, clipLine, mapFrame, matchChunks, parseArgs, parseFrame, parseFrames, searchCommits, wrapperConfigText } from './errors-resolve.mjs';

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
    expect(parseArgs(['a.js:1:2', '--max', '3'])).toEqual({ frames: ['a.js:1:2'], max: 3, from: 'origin/main', build: null });
    expect(parseArgs(['--from', 'drill', 'a.js:1:2']).from).toBe('drill');
    expect(parseArgs(['a.js:1:2']).max).toBe(40);
  });
  it('collects several frames with --max anywhere', () => {
    expect(parseArgs(['a.js:1:2', '--max', '5', 'b.js:3:4', 'c.js:5:6'])).toEqual({ frames: ['a.js:1:2', 'b.js:3:4', 'c.js:5:6'], max: 5, from: 'origin/main', build: null });
    expect(parseArgs(['--max', '2', 'a.js:1:2', 'b.js:3:4']).frames).toHaveLength(2);
  });
});

describe('parseArgs --build', () => {
  it('accepts 7 and 40 hex chars and lowercases', () => {
    expect(parseArgs(['a.js:1:2', '--build', 'abc1234']).build).toBe('abc1234');
    const full = 'a'.repeat(40);
    expect(parseArgs(['--build', full, 'a.js:1:2']).build).toBe(full);
    expect(parseArgs(['--build', 'ABC1234', 'a.js:1:2']).build).toBe('abc1234');
  });
  it('is null when absent and composes with --max and --from', () => {
    expect(parseArgs(['a.js:1:2']).build).toBeNull();
    expect(parseArgs(['a.js:1:2', '--build', 'abc1234', '--max', '5', '--from', 'drill'])).toEqual({ frames: ['a.js:1:2'], max: 5, from: 'drill', build: 'abc1234' });
  });
  it('rejects an invalid value as an error, never a silent fall back', () => {
    for (const bad of ['abc123', 'xyz1234', 'a'.repeat(41), 'main']) {
      const r = parseArgs(['a.js:1:2', '--build', bad]);
      expect(r.error).toContain(bad);
      expect(r.error).not.toContain('\n');
    }
    expect(parseArgs(['a.js:1:2', '--build']).error).toBeTruthy();
  });
});

describe('candidateShas', () => {
  const full = 'abcdef1' + '0'.repeat(33);
  it('resolves one full sha for --build, with no first-parent limit', () => {
    const calls = [];
    const git = (...args) => { calls.push(args); return full; };
    expect(candidateShas({ build: 'abcdef1', from: 'origin/main', max: 40 }, git)).toEqual({ shas: [full] });
    expect(calls).toEqual([['rev-parse', '--verify', 'abcdef1^{commit}']]);
  });
  it('fetches once on an unknown sha, then retries', () => {
    const calls = [];
    let fetched = false;
    const git = (...args) => {
      calls.push(args);
      if (args[0] === 'fetch') { fetched = true; return ''; }
      if (!fetched) throw new Error('unknown');
      return full;
    };
    expect(candidateShas({ build: 'abcdef1', from: 'origin/main', max: 40 }, git)).toEqual({ shas: [full] });
    expect(calls.filter((c) => c[0] === 'fetch')).toEqual([['fetch', 'origin']]);
  });
  it('errors when the commit is still unknown after one fetch', () => {
    const calls = [];
    const git = (...args) => { calls.push(args); throw new Error('unknown'); };
    expect(candidateShas({ build: 'abcdef1', from: 'origin/main', max: 40 }, git)).toEqual({ error: 'commit abcdef1 is not in this repository (git fetch origin?)' });
    expect(calls.filter((c) => c[0] === 'fetch')).toHaveLength(1);
    expect(calls.filter((c) => c[0] === 'rev-parse')).toHaveLength(2);
  });
  it('without --build keeps the first-parent list and respects max', () => {
    const calls = [];
    const git = (...args) => { calls.push(args); return 'a1\nb2\n\nc3'; };
    expect(candidateShas({ build: null, from: 'drill', max: 7 }, git)).toEqual({ shas: ['a1', 'b2', 'c3'] });
    expect(calls).toEqual([['rev-list', '--first-parent', '-n', '7', 'drill']]);
  });
});

describe('single-commit path with a mocked build', () => {
  const sha = 'abcdef1' + '0'.repeat(33);
  const frames = [{ chunk: 'PdfMergeTool.C4ILDZF-.js', line: 1, col: 1 }];
  const map = { version: 3, sources: ['a.ts'], names: ['foo'], mappings: 'AAAAA,IAAIA', file: 'x.js' };
  const mkDeps = (emitted) => {
    const calls = { checkout: [], build: 0 };
    return {
      calls,
      checkout: (s) => { calls.checkout.push(s); },
      build: () => { calls.build++; return true; },
      readEmitted: () => emitted,
      readMap: () => map,
      readSource: () => 'const foo = 1;',
      subject: () => 'a subject',
    };
  };
  it('a hit prints the mapped frames from the one commit', () => {
    const deps = mkDeps(['PdfMergeTool.C4ILDZF-.js']);
    const r = searchCommits([sha], frames, deps);
    expect(r.found).toBe(true);
    expect(r.lines[0]).toBe(`${sha.slice(0, 8)} a subject`);
    expect(r.lines).toContain('#1 a.ts:1:1 (foo)');
    expect(deps.calls.checkout).toEqual([sha]);
    expect(deps.calls.build).toBe(1);
  });
  it('a miss names the commit and the chunks it did not emit, and tries nothing else', () => {
    const deps = mkDeps(['other.js']);
    const r = searchCommits([sha], frames, deps);
    expect(r.found).toBe(false);
    expect(deps.calls.checkout).toEqual([sha]);
    expect(deps.calls.build).toBe(1);
    const msg = buildMissMessage(sha, r.last.missing);
    expect(msg).toContain(sha.slice(0, 8));
    expect(msg).toContain('PdfMergeTool.C4ILDZF-.js');
    expect(msg).toContain('try without --build');
    expect(msg).not.toContain('\n');
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

describe('matchChunks', () => {
  const frames = [
    { chunk: 'sortable.esm.BqtE8hmV.js', line: 1, col: 1 },
    { chunk: 'PdfMergeTool.C4ILDZF-.js', line: 2, col: 2 },
    { chunk: 'sortable.esm.BqtE8hmV.js', line: 3, col: 3 },
  ];
  it('matches only when every chunk of the report was emitted', () => {
    expect(matchChunks(frames, ['sortable.esm.BqtE8hmV.js', 'PdfMergeTool.C4ILDZF-.js', 'other.js'])).toEqual({ all: true, missing: [] });
  });
  it('a shared vendor chunk alone does not make the build the report\'s own', () => {
    // The 2026-10-01 case: Sortable keeps its hash across builds, Merge's chunk changed.
    expect(matchChunks(frames, ['sortable.esm.BqtE8hmV.js', 'PdfMergeTool.NEWHASH.js'])).toEqual({ all: false, missing: ['PdfMergeTool.C4ILDZF-.js'] });
  });
  it('names each missing chunk once', () => {
    expect(matchChunks(frames, []).missing).toEqual(['sortable.esm.BqtE8hmV.js', 'PdfMergeTool.C4ILDZF-.js']);
  });
});

describe('clipLine', () => {
  it('leaves a short line unchanged', () => {
    expect(clipLine('const a = 1;', 5)).toBe('const a = 1;');
    expect(clipLine('x'.repeat(160), 80)).toBe('x'.repeat(160));
  });
  it('clips a minified line to a window around the column with both ellipses', () => {
    const line = 'a'.repeat(3251) + 'B' + 'c'.repeat(1748);
    const out = clipLine(line, 3252);
    expect(out.length).toBeLessThanOrEqual(162);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toContain('B');
  });
  it('clips near the start with only a trailing ellipsis', () => {
    const out = clipLine('y'.repeat(5000), 3);
    expect(out.startsWith('…')).toBe(false);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(161);
  });
});
