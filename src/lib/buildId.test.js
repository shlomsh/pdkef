import { describe, expect, it } from 'vitest';
import { computeBuildId } from '../../scripts/buildId.mjs';

const FONT_PATH = 'fonts/Arimo-Regular.ttf';

function files(overrides = {}) {
  const base = {
    'index.html': Buffer.from('<html>v1</html>'),
    [FONT_PATH]: Buffer.from('font-bytes-v1'),
  };
  return Object.entries({ ...base, ...overrides }).map(([relativePath, content]) => ({
    relativePath,
    content,
  }));
}

describe('computeBuildId', () => {
  it('is deterministic for the same file set', () => {
    expect(computeBuildId(files())).toBe(computeBuildId(files()));
  });

  it('changes when a file\'s content changes at the same relative path', () => {
    // This is the case a URL-list-only hash cannot see: fonts (and every other
    // public/ asset) are copied verbatim, so their path is identical build to
    // build even when scripts/font-languages.mjs or a font fix changes their
    // bytes - see buildId.mjs's module doc.
    const before = computeBuildId(files());
    const after = computeBuildId(files({ [FONT_PATH]: Buffer.from('font-bytes-v2') }));
    expect(after).not.toBe(before);
  });

  it('changes when the set of paths changes but every existing file is untouched', () => {
    const before = computeBuildId(files());
    const after = computeBuildId(files({ 'fonts/NewFace-Regular.ttf': Buffer.from('new-face') }));
    expect(after).not.toBe(before);
  });

  it('does not collide two path/content splits that concatenate to the same bytes', () => {
    const a = computeBuildId([{ relativePath: 'ab', content: Buffer.from('c') }]);
    const b = computeBuildId([{ relativePath: 'a', content: Buffer.from('bc') }]);
    expect(a).not.toBe(b);
  });
});
