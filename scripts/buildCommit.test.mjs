import { describe, expect, it } from 'vitest';
import { commitFromEnv, hasPlaceholder, stampBuildCommit } from './buildCommit.mjs';

const TAG = '<meta name="pdkef-build" content="__BUILD_COMMIT__">';
const page = (tag = TAG) => `<html><head>\n<title>x</title>\n${tag}\n<meta charset="utf-8"></head><body></body></html>`;
const SHA40 = 'abcdef0123456789abcdef0123456789abcdef01';

describe('commitFromEnv', () => {
  const env = (v) => ({ VERCEL_GIT_COMMIT_SHA: v });
  it('takes the first 7 chars of a 40 hex sha', () => {
    expect(commitFromEnv(env(SHA40))).toBe('abcdef0');
  });
  it('accepts exactly 7 hex', () => {
    expect(commitFromEnv(env('abc1234'))).toBe('abc1234');
  });
  it('rejects 6, 41, uppercase, non-hex, unset and empty', () => {
    expect(commitFromEnv(env('abc123'))).toBe('');
    expect(commitFromEnv(env(`${SHA40}0`))).toBe('');
    expect(commitFromEnv(env('ABC1234'))).toBe('');
    expect(commitFromEnv(env('abc123g'))).toBe('');
    expect(commitFromEnv({})).toBe('');
    expect(commitFromEnv(env(''))).toBe('');
  });
});

describe('stampBuildCommit', () => {
  it('replaces the placeholder with the real tag', () => {
    expect(stampBuildCommit(page(), 'abc1234')).toBe(
      page('<meta name="pdkef-build" content="abc1234">'),
    );
  });
  it('tolerates a trailing slash', () => {
    const out = stampBuildCommit(page('<meta name="pdkef-build" content="__BUILD_COMMIT__" />'), 'abc1234');
    expect(out).toContain('<meta name="pdkef-build" content="abc1234">');
    expect(out).not.toContain('__BUILD_COMMIT__');
  });
  it('removes the tag and its line when there is no commit', () => {
    expect(stampBuildCommit(page(), '')).toBe(page('').replace('\n\n', '\n'));
    expect(stampBuildCommit(page('<meta name="pdkef-build" content="__BUILD_COMMIT__"/>'), '')).not.toContain(
      'pdkef-build',
    );
  });
  it('leaves html without the placeholder unchanged', () => {
    const html = '<html><head></head></html>';
    expect(stampBuildCommit(html, 'abc1234')).toBe(html);
    expect(stampBuildCommit(html, '')).toBe(html);
  });
  it('only touches the tag, not the placeholder text elsewhere', () => {
    const html = page().replace('</body>', '<script>var p="__BUILD_COMMIT__";</script></body>');
    const out = stampBuildCommit(html, 'abc1234');
    expect(out).toContain('<script>var p="__BUILD_COMMIT__";</script>');
    expect(out).toContain('content="abc1234"');
  });
  it('hasPlaceholder sees the tag only', () => {
    expect(hasPlaceholder(page())).toBe(true);
    expect(hasPlaceholder(stampBuildCommit(page(), 'abc1234'))).toBe(false);
    expect(hasPlaceholder('<script>"__BUILD_COMMIT__"</script>')).toBe(false);
  });
  it('stamping with no commit is identical whatever the commit would have been', () => {
    const a = stampBuildCommit(page(), '');
    expect(stampBuildCommit(page(), '')).toBe(a);
    expect(stampBuildCommit(stampBuildCommit(page(), 'abc1234'), 'def5678')).toBe(
      stampBuildCommit(page(), 'abc1234'),
    );
    expect(stampBuildCommit(page(), 'abc1234').replace('abc1234', '__BUILD_COMMIT__')).toBe(page());
  });
});
