import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// verify-csp.js reads <cwd>/dist, so each case plants a small dist/ in a temp dir and runs the real CLI there.
const script = fileURLToPath(new URL('./verify-csp.js', import.meta.url));
const sha = (text) => `'sha256-${crypto.createHash('sha256').update(text).digest('base64')}'`;

const INLINE_JS = 'window.a = 1;';
const INLINE_CSS = 'body{margin:0}';

function page({ csp, body = '' }) {
  const meta = csp === null ? '' : `<meta http-equiv="content-security-policy" content="${csp}">`;
  return `<!doctype html><html><head>${meta}</head><body>${body}</body></html>`;
}

const goodCsp = (extra = '') =>
  `default-src 'none'; script-src 'self' ${sha(INLINE_JS)}; style-src 'self' ${sha(INLINE_CSS)}; connect-src 'self'${extra}`;
const goodBody = `<script>${INLINE_JS}</script><style>${INLINE_CSS}</style>`;
const driveCsp = goodCsp(' https://accounts.google.com https://www.googleapis.com https://apis.google.com https://docs.google.com https://drive.google.com https://content.googleapis.com');

const videoFrame = '; frame-src https://www.youtube-nocookie.com';

// A developer's shell must not change the result, so the default env never carries the analytics variable.
const { PUBLIC_ANALYTICS_HOST: _host, PUBLIC_ANALYTICS_KEY: _key, ...baseEnv } = process.env;

// A clean two-page dist; `overrides` replaces or adds files by dist-relative path.
function run(overrides = {}, env = baseEnv, extraFiles = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-csp-'));
  const files = {
    'index.html': page({ csp: goodCsp(videoFrame), body: goodBody }),
    'drive/index.html': page({ csp: driveCsp, body: goodBody }),
    ...overrides,
  };
  for (const [rel, html] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, 'dist', rel)), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'dist', rel), html);
  }
  for (const [rel, text] of Object.entries(extraFiles)) fs.writeFileSync(path.join(cwd, rel), text);
  const r = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', env });
  return { status: r.status, err: r.stderr };
}

describe('verify-csp CLI', () => {
  it('passes a build whose inline scripts and styles are all hashed and only /drive/ allows Google', () => {
    const r = run();
    expect(r.err).toBe('');
    expect(r.status).toBe(0);
  });

  it('fails a page with no CSP meta tag', () => {
    const r = run({ 'index.html': page({ csp: null, body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('no CSP meta tag at all');
  });

  it('fails an inline script whose hash is not in script-src', () => {
    const r = run({ 'index.html': page({ csp: goodCsp(), body: `${goodBody}<script>window.b = 2;</script>` }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('Inline script hash');
  });

  it('fails an inline style whose hash is not in style-src', () => {
    const r = run({ 'index.html': page({ csp: goodCsp(), body: `${goodBody}<style>p{color:red}</style>` }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('Inline style hash');
  });

  it('fails a literal style attribute', () => {
    const r = run({ 'index.html': page({ csp: goodCsp(), body: `${goodBody}<p style="color:red">x</p>` }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('literal style="..." attribute');
  });

  it('fails a script-src that dropped \'self\'', () => {
    const csp = `default-src 'none'; script-src ${sha(INLINE_JS)}; style-src ${sha(INLINE_CSS)}`;
    const r = run({ 'index.html': page({ csp, body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain("script-src is missing 'self'");
  });

  it('does not require a hash for non-executable JSON script blocks', () => {
    const body = `${goodBody}<script type="application/ld+json">{"a":1}</script>`;
    expect(run({ 'index.html': page({ csp: goodCsp(videoFrame), body }) }).status).toBe(0);
  });

  it('fails a Google origin in the CSP of a page other than /drive/', () => {
    const r = run({ 'index.html': page({ csp: driveCsp, body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('which only dist/drive/index.html may allow');
  });

  it('reads style-src, not a style-src-elem written before it, for the inline style hashes', () => {
    const csp = `style-src-elem 'self' 'unsafe-inline'; ${driveCsp}`;
    const r = run({ 'drive/index.html': page({ csp, body: goodBody }) });
    expect(r.err).toBe('');
  });

  it("fails 'unsafe-inline' in style-src-elem on a page other than /drive/", () => {
    const r = run({ 'index.html': page({ csp: `${goodCsp()}; style-src-elem 'self' 'unsafe-inline'`, body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain("'unsafe-inline' in style-src-elem");
  });

  it('fails the video player origin in the CSP of a page without the video', () => {
    const r = run({ 'merge/index.html': page({ csp: goodCsp('; frame-src https://www.youtube-nocookie.com'), body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('which only the pages with the video may allow');
  });

  it('fails when /redact/ does not allow the video player origin', () => {
    const r = run({ 'redact/index.html': page({ csp: goodCsp(), body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('which the video needs');
  });

  it('fails when the home page does not allow the video player origin', () => {
    const r = run({ 'index.html': page({ csp: goodCsp(), body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('which the video needs');
  });

  it('fails /redact/ allowing any frame beyond the video player origin', () => {
    const r = run({ 'redact/index.html': page({ csp: goodCsp('; frame-src * https://www.youtube-nocookie.com'), body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('which the video needs');
  });

  it('passes /redact/ allowing the video player origin in frame-src alone', () => {
    const r = run({ 'redact/index.html': page({ csp: goodCsp('; frame-src https://www.youtube-nocookie.com'), body: goodBody }) });
    expect(r.status).toBe(0);
  });

  it('fails when /drive/ does not allow the Google origins it needs', () => {
    const r = run({ 'drive/index.html': page({ csp: goodCsp(), body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('which the Drive page needs');
  });

  describe('connect-src pin', () => {
    const HOST = 'https://e.example.test';
    const withHost = { ...baseEnv, PUBLIC_ANALYTICS_HOST: HOST, PUBLIC_ANALYTICS_KEY: 'k' };
    const videoWith = goodCsp(` ${HOST}${videoFrame}`);

    it('unset: fails a page whose connect-src carries another origin, naming the page', () => {
      const r = run({ 'merge/index.html': page({ csp: goodCsp().replace("connect-src 'self'", "connect-src 'self' https://evil.example"), body: goodBody }) });
      expect(r.status).toBe(1);
      expect(r.err).toContain('merge');
      expect(r.err).toContain('connect-src');
    });

    it('unset: the good fixtures still pass', () => {
      expect(run().status).toBe(0);
    });

    it('set: pages carrying the origin pass, drive included', () => {
      const r = run({
        'index.html': page({ csp: videoWith, body: goodBody }),
        'drive/index.html': page({ csp: `${driveCsp} ${HOST}`, body: goodBody }),
        'merge/index.html': page({ csp: goodCsp(` ${HOST}`), body: goodBody }),
      }, withHost);
      expect(r.err).toBe('');
      expect(r.status).toBe(0);
    });

    it('set: a page still at plain connect-src \'self\' fails', () => {
      const r = run({
        'index.html': page({ csp: videoWith, body: goodBody }),
        'drive/index.html': page({ csp: `${driveCsp} ${HOST}`, body: goodBody }),
        'merge/index.html': page({ csp: goodCsp(), body: goodBody }),
      }, withHost);
      expect(r.status).toBe(1);
      expect(r.err).toContain('merge');
    });

    it('set to http: exits non-zero naming the variable', () => {
      const r = run({}, { ...baseEnv, PUBLIC_ANALYTICS_HOST: 'http://x', PUBLIC_ANALYTICS_KEY: 'k' });
      expect(r.status).not.toBe(0);
      expect(r.err).toContain('PUBLIC_ANALYTICS_HOST');
    });

    const dotEnvLocal = { '.env.local': `PUBLIC_ANALYTICS_HOST=${HOST}\nPUBLIC_ANALYTICS_KEY=dummy\n` };
    const allPages = (merge) => ({
      'index.html': page({ csp: videoWith, body: goodBody }),
      'drive/index.html': page({ csp: `${driveCsp} ${HOST}`, body: goodBody }),
      'merge/index.html': page({ csp: merge, body: goodBody }),
    });

    it('set only in .env.local: pages carrying the origin pass', () => {
      const r = run(allPages(goodCsp(` ${HOST}`)), baseEnv, dotEnvLocal);
      expect(r.err).toBe('');
      expect(r.status).toBe(0);
    });

    it('set only in .env.local: a page at plain connect-src \'self\' fails', () => {
      const r = run(allPages(goodCsp()), baseEnv, dotEnvLocal);
      expect(r.status).toBe(1);
      expect(r.err).toContain('merge');
    });
  });
});
