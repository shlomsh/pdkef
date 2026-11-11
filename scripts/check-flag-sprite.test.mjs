import { describe, expect, it } from 'vitest';
import { findSpriteProblems } from './check-flag-sprite.mjs';

const page = (path, url) => ({ path, html: `<img src="${url}#IN"><img src="${url}#US">` });

describe('findSpriteProblems', () => {
  it('passes when every board names the one sprite the build wrote', () => {
    const pages = [page('/index.html', '/flags/notes-aaaaaaaaaa.svg'), page('/redact/index.html', '/flags/notes-aaaaaaaaaa.svg')];
    expect(findSpriteProblems(pages, (url) => url === '/flags/notes-aaaaaaaaaa.svg').problems).toEqual([]);
  });
  it('fails when a page names a sprite that is not in dist', () => {
    const { problems } = findSpriteProblems([page('/redact/index.html', '/flags/notes-0fe085a810.svg')], () => false);
    expect(problems.join('\n')).toMatch(/notes-0fe085a810\.svg is named by 1 page\(s\) \(\/redact\/index\.html\) and is not in dist/);
  });
  it('fails when two boards name different sprites, even if both exist', () => {
    const pages = [page('/index.html', '/flags/notes-404c9711ce.svg'), page('/redact/index.html', '/flags/notes-0fe085a810.svg')];
    expect(findSpriteProblems(pages, () => true).problems.join('\n')).toMatch(/2 different sprites/);
  });
  it('passes on a build with no notes', () => {
    expect(findSpriteProblems([{ path: '/index.html', html: '<p>no board</p>' }], () => false)).toEqual({ sprites: [], problems: [] });
  });
});
