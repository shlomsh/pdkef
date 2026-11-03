import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./generate-precache-manifest.mjs', import.meta.url));
const page = (body) => `<!doctype html><html><head>${body}</head><body></body></html>`;

// A small build output: the home page (shell), one tool page with a lazily imported chunk, the
// online-only Drive page, a runtime-only font, and the placeholders the generator stamps.
const DIST = {
  'index.html': page(
    '<link rel="stylesheet" href="/_astro/app.css"><link rel="icon" href="/favicon.svg"><link rel="manifest" href="/manifest.webmanifest"><script type="module" src="/_astro/app.js"></script>',
  ),
  'sign/index.html': page('<script type="module" src="/_astro/sign.js"></script>'),
  'drive/index.html': page('<script type="module" src="/_astro/drive.js"></script>'),
  'about/index.html': page('<p>Build __BUILD_ID__</p>'),
  '_astro/app.js': 'export const app = 1;',
  '_astro/app.css': 'body{margin:0}',
  '_astro/sign.js': 'export const sign = () => import("./signChunk.js");',
  '_astro/signChunk.js': 'export const chunk = 1;',
  '_astro/drive.js': 'export const drive = 1;',
  'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'manifest.webmanifest': '{"name":"pdkef"}',
  'fonts/Unused-Regular.ttf': 'font bytes',
  'sw.js': 'const BUILD = "__BUILD_ID__";',
};

let work;
let manifest;
let distDir;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'precache-manifest-'));
  distDir = path.join(work, 'dist');
  for (const [file, content] of Object.entries(DIST)) {
    fs.mkdirSync(path.dirname(path.join(distDir, file)), { recursive: true });
    fs.writeFileSync(path.join(distDir, file), content);
  }
  const run = spawnSync(process.execPath, [script], { cwd: work, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`generator failed: ${run.stderr}`);
  manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'precache-manifest.json'), 'utf8'));
});

afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

describe('generate-precache-manifest', () => {
  it('lists the home page, its assets and its icon links in the shell the worker installs', () => {
    expect(manifest.version).toBe(2);
    expect(manifest.shell).toEqual(
      expect.arrayContaining(['/', '/_astro/app.js', '/_astro/app.css', '/favicon.svg', '/manifest.webmanifest']),
    );
  });

  it('lists each page with its own scripts and the chunks it imports lazily', () => {
    expect(manifest.pages['/sign/']).toEqual(['/sign/', '/_astro/sign.js', '/_astro/signChunk.js']);
  });

  it('keeps the online-only Drive page, its chunks, the manifest, the worker and runtime-only fonts out of the install', () => {
    const everything = [...manifest.shell, ...Object.values(manifest.pages).flat()];
    expect(manifest.pages['/drive/']).toBeUndefined();
    expect(everything).not.toContain('/_astro/drive.js');
    expect(everything).not.toContain('/precache-manifest.json');
    expect(everything).not.toContain('/sw.js');
    expect(everything).not.toContain('/fonts/Unused-Regular.ttf');
  });

  it('hashes every precached URL that is not content-hashed under /_astro/, and lists every font', () => {
    expect(Object.keys(manifest.hashes).sort()).toEqual(
      ['/', '/about/', '/favicon.svg', '/fonts/Unused-Regular.ttf', '/manifest.webmanifest', '/sign/'].sort(),
    );
  });

  it('stamps one build id into the manifest, the worker and the about page', () => {
    const worker = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
    const about = fs.readFileSync(path.join(distDir, 'about', 'index.html'), 'utf8');
    expect(manifest.build).toMatch(/\S/);
    expect(worker).toContain(manifest.build);
    expect(about).toContain(manifest.build);
    expect(worker).not.toContain('__BUILD_ID__');
    expect(about).not.toContain('__BUILD_ID__');
  });
});
