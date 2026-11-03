import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The guard reads <cwd>/dist and <cwd>/vercel.json, so each case plants both in a temp dir and runs the real CLI.
const script = fileURLToPath(new URL('./check-trailing-slash-redirects.js', import.meta.url));

const slash = (route) => ({ source: `/${route}`, destination: `/${route}/`, permanent: true });

function run({ routes, vercel }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slash-redirects-'));
  for (const route of routes) {
    fs.mkdirSync(path.join(cwd, 'dist', route), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'dist', route, 'index.html'), '<!doctype html>');
  }
  fs.writeFileSync(path.join(cwd, 'vercel.json'), JSON.stringify(vercel));
  const r = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
  return { status: r.status, err: r.stderr, out: r.stdout };
}

describe('check-trailing-slash-redirects CLI', () => {
  it('passes when every real route, nested ones included, has its non-slash to slash redirect', () => {
    const r = run({ routes: ['merge', 'tools/sign'], vercel: { redirects: [slash('merge'), slash('tools/sign')] } });
    expect(r.err).toBe('');
    expect(r.status).toBe(0);
    expect(r.out).toContain('2 real route(s)');
  });

  it('fails a real route with no redirect for its non-slash form', () => {
    const r = run({ routes: ['merge', 'split'], vercel: { redirects: [slash('merge')] } });
    expect(r.status).toBe(1);
    expect(r.err).toContain('"/split/" has no matching vercel.json redirect for "/split" -> "/split/"');
  });

  it('fails a redirect that points the non-slash form somewhere other than the slash route', () => {
    const r = run({ routes: ['merge'], vercel: { redirects: [{ source: '/merge', destination: '/elsewhere/' }] } });
    expect(r.status).toBe(1);
    expect(r.err).toContain('expected "/merge/"');
  });

  it('fails a blanket "trailingSlash": true', () => {
    const r = run({ routes: ['merge'], vercel: { trailingSlash: true, redirects: [slash('merge')] } });
    expect(r.status).toBe(1);
    expect(r.err).toContain('"trailingSlash": true');
  });

  it('does not ask for a self redirect on a route a slash-source redirect already retires', () => {
    const retired = { source: '/old/', destination: '/new/', permanent: true };
    const r = run({ routes: ['old', 'new'], vercel: { redirects: [retired, slash('new')] } });
    expect(r.err).toBe('');
    expect(r.status).toBe(0);
  });
});
