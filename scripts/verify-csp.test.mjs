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
const driveCsp = goodCsp(' https://accounts.google.com https://www.googleapis.com');

// A clean two-page dist; `overrides` replaces or adds files by dist-relative path.
function run(overrides = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-csp-'));
  const files = {
    'index.html': page({ csp: goodCsp(), body: goodBody }),
    'drive/index.html': page({ csp: driveCsp, body: goodBody }),
    ...overrides,
  };
  for (const [rel, html] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, 'dist', rel)), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'dist', rel), html);
  }
  const r = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
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
    expect(run({ 'index.html': page({ csp: goodCsp(), body }) }).status).toBe(0);
  });

  it('fails a Google origin in the CSP of a page other than /drive/', () => {
    const r = run({ 'index.html': page({ csp: driveCsp, body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('which only dist/drive/index.html may allow');
  });

  it('fails when /drive/ does not allow the Google origins it needs', () => {
    const r = run({ 'drive/index.html': page({ csp: goodCsp(), body: goodBody }) });
    expect(r.status).toBe(1);
    expect(r.err).toContain('which the Drive page needs');
  });
});
