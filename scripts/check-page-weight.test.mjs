import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The guard measures <its own folder>/../dist, so each case copies the script and its two helper modules into a
// temp tree next to a planted dist/ and runs that copy. Random bytes do not compress, so a file's brotli size is
// its raw size.
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const MAX_FIRST_LOAD_BROTLI = 400_000;
const MAX_EAGER_IMAGE_BYTES = 15_000;

function run(pages, assets = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'page-weight-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const f of ['check-page-weight.js', 'pageCss.mjs', 'precacheClosure.mjs']) {
    fs.copyFileSync(path.join(scriptsDir, f), path.join(root, 'scripts', f));
  }
  for (const [rel, content] of Object.entries({ ...pages, ...assets })) {
    fs.mkdirSync(path.dirname(path.join(root, 'dist', rel)), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', rel), content);
  }
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-page-weight.js')], { encoding: 'utf8' });
  return { status: r.status, err: r.stderr, out: r.stdout };
}

// Deterministic incompressible bytes: SHA-256 in counter mode.
const noise = (bytes) =>
  Buffer.concat(Array.from({ length: Math.ceil(bytes / 32) }, (_, i) => crypto.createHash('sha256').update(String(i)).digest())).subarray(0, bytes);
const html = (body) => `<!doctype html><html><head></head><body>${body}</body></html>`;

describe('check-page-weight', () => {
  it('passes a light page with a small image', () => {
    const r = run(
      { 'index.html': html('<img src="/logo.png" width="24" height="24">') },
      { 'logo.png': noise(MAX_EAGER_IMAGE_BYTES - 1000) },
    );
    expect(r.err).toBe('');
    expect(r.status).toBe(0);
    expect(r.out).toContain('Page weight check passed');
  });

  it('fails a page whose eagerly loaded JS pushes first load over the brotli budget', () => {
    const r = run(
      { 'index.html': html('<script type="module" src="/_astro/entry.js"></script>') },
      { '_astro/entry.js': noise(MAX_FIRST_LOAD_BROTLI + 5_000) },
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain('Page weight budget exceeded: /');
  });

  it('counts JS reached only through a static import of the entry chunk', () => {
    const r = run(
      { 'index.html': html('<script type="module" src="/_astro/entry.js"></script>') },
      { '_astro/entry.js': 'import "./big.js";\n', '_astro/big.js': noise(MAX_FIRST_LOAD_BROTLI + 5_000) },
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain('Page weight budget exceeded');
  });

  it('does not count JS behind a dynamic import()', () => {
    const r = run(
      { 'index.html': html('<script type="module" src="/_astro/entry.js"></script>') },
      { '_astro/entry.js': 'export const load = () => import("./big.js");\n', '_astro/big.js': noise(MAX_FIRST_LOAD_BROTLI + 5_000) },
    );
    expect(r.err).toBe('');
    expect(r.status).toBe(0);
  });

  it('fails a page whose eager images are over the raw-byte budget', () => {
    const r = run(
      { 'index.html': html('<img src="/hero.png">') },
      { 'hero.png': noise(MAX_EAGER_IMAGE_BYTES + 1_000) },
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain('Eager image budget exceeded: /');
  });

  it('does not count a loading="lazy" image', () => {
    const r = run(
      { 'index.html': html('<img src="/hero.png" loading="lazy">') },
      { 'hero.png': noise(MAX_EAGER_IMAGE_BYTES + 1_000) },
    );
    expect(r.err).toBe('');
    expect(r.status).toBe(0);
  });
});
