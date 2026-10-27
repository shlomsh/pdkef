import { describe, expect, it } from 'vitest';
import { fullClosure, htmlRefs, pageClosure, pageEntries, shellClosure, staticClosure } from './precacheClosure.mjs';

// A small synthetic dist/: one tool page with an island, a lazy engine behind
// a dynamic import, a worker spelled as a string, wasm under /pdfjs-dist-wasm/.
const SIGN_HTML = `<html><head>
<link rel="stylesheet" href="/_astro/page.css">
<link rel="icon" href="/icons/favicon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="canonical" href="https://pdkef.com/sign/">
<style>@font-face{src:url(/fonts/Arimo-Regular.ttf)}@font-face{src:url(/fonts/Heebo-Bold.ttf)}</style>
<script type="application/ld+json">{"url":"/_astro/never.js"}</script>
<script type="module">import("/_astro/inline.js")</script>
<script type="module" src="/_astro/boot.js"></script>
</head><body>
<a href="/merge/">Merge</a><img src="/images/photo.jpg"><picture><source srcset="/images/photo.webp"></picture>
<astro-island component-url="/_astro/PdfSignTool.js" renderer-url="/_astro/client.js" before-hydration-url="/_astro/hydrate.js"></astro-island>
</body></html>`;

const files = new Map([
  ['index.html', '<html><body><a href="/sign/">Sign</a><link rel="icon" href="/icons/favicon.png"><link rel="manifest" href="/manifest.webmanifest"><script type="module" src="/_astro/boot.js"></script></body></html>'],
  ['sign/index.html', SIGN_HTML],
  ['merge/index.html', '<html><body><astro-island component-url="/_astro/PdfMergeTool.js"></astro-island></body></html>'],
  ['_astro/boot.js', 'import{a}from"./shared.js";export{b}from"./reexport.js";'],
  ['_astro/shared.js', 'export const a=1;'],
  ['_astro/reexport.js', 'export const b=1;'],
  ['_astro/inline.js', 'export const i=1;'],
  ['_astro/client.js', 'export const c=1;'],
  ['_astro/hydrate.js', 'export const h=1;'],
  ['_astro/page.css', '.x{background:url(../fonts/Alef-Regular.ttf)}.y{background:url("data:image/png;base64,AAA")}'],
  ['_astro/PdfSignTool.js', 'import{a}from"./shared.js";const load=()=>import("./pdf-lib.js");const w=`/_astro/pdfWorker.js`;const d=(i)=>i.map(i=>m.f[i]);m.f=["_astro/mapped.js","_astro/page.css"];'],
  ['_astro/pdf-lib.js', 'const wasm="/pdfjs-dist-wasm/";export default wasm;'],
  ['_astro/mapped.js', 'export const m=1;'],
  ['_astro/pdfWorker.js', 'const u=new URL("./workerHelper.js",import.meta.url);'],
  ['_astro/workerHelper.js', 'export const wh=1;'],
  ['_astro/PdfMergeTool.js', 'export const merge=1;'],
]);
const paths = [
  ...files.keys(),
  '_astro/never.js', 'images/photo.jpg', 'images/photo.webp', 'icons/favicon.png', 'manifest.webmanifest',
  'fonts/Arimo-Regular.ttf', 'fonts/Heebo-Bold.ttf', 'fonts/Alef-Regular.ttf',
  'pdfjs-dist-wasm/openjpeg.wasm', 'pdfjs-dist-wasm/openjpeg_nowasm_fallback.js', 'sign/index.md',
];
const view = { files, paths };
const keep = (relative) => !relative.startsWith('fonts/') || relative === 'fonts/Arimo-Regular.ttf';

describe('pageClosure', () => {
  const sign = pageClosure(view, 'sign/index.html', { keep });

  it('starts with the page URL and includes the island, its dynamic chunk and the worker', () => {
    expect(sign[0]).toBe('/sign/');
    expect(sign).toContain('/_astro/PdfSignTool.js');
    expect(sign).toContain('/_astro/pdf-lib.js');
    expect(sign).toContain('/_astro/pdfWorker.js');
    expect(sign).toContain('/_astro/workerHelper.js');
    expect(sign).toContain('/_astro/mapped.js');
    expect(sign).toContain('/_astro/inline.js');
    expect(sign).toContain('/_astro/hydrate.js');
    expect(sign).toContain('/_astro/reexport.js');
    expect(sign).toContain('/pdfjs-dist-wasm/openjpeg.wasm');
  });

  it('leaves out other pages, html-only rasters, ld+json strings, fallbacks and Markdown twins', () => {
    expect(sign).not.toContain('/merge/');
    expect(sign).not.toContain('/_astro/PdfMergeTool.js');
    expect(sign).not.toContain('/images/photo.jpg');
    expect(sign).not.toContain('/images/photo.webp');
    expect(sign).not.toContain('/_astro/never.js');
    expect(sign).not.toContain('/pdfjs-dist-wasm/openjpeg_nowasm_fallback.js');
    expect(sign).not.toContain('/sign/index.md');
    expect(sign).not.toContain('/icons/favicon.png');
  });

  it('takes Arimo from the inline CSS url and drops the other fonts', () => {
    expect(sign).toContain('/fonts/Arimo-Regular.ttf');
    expect(sign).not.toContain('/fonts/Heebo-Bold.ttf');
    expect(sign).not.toContain('/fonts/Alef-Regular.ttf');
  });

  it('follows url() in a linked stylesheet through the byte policy', () => {
    const everything = pageClosure(view, 'sign/index.html');
    expect(everything).toContain('/fonts/Alef-Regular.ttf');
    expect(sign).not.toContain('/fonts/Alef-Regular.ttf');
  });
});

describe('shellClosure', () => {
  it('is the home page closure plus icon and manifest links', () => {
    const shell = shellClosure(view, { keep });
    expect(shell[0]).toBe('/');
    expect(shell).toContain('/icons/favicon.png');
    expect(shell).toContain('/manifest.webmanifest');
    expect(shell).toContain('/_astro/shared.js');
    expect(shell).not.toContain('/sign/');
  });
});

describe('static closure (what check-lazy-modules asks)', () => {
  it('follows static imports and re-exports but not dynamic imports, workers or maps', () => {
    const entries = pageEntries(SIGN_HTML);
    expect(entries).toContain('/_astro/PdfSignTool.js');
    const eager = [...staticClosure(view, entries)].sort();
    expect(eager).toContain('_astro/shared.js');
    expect(eager).toContain('_astro/reexport.js');
    expect(eager).not.toContain('_astro/pdf-lib.js');
    expect(eager).not.toContain('_astro/pdfWorker.js');
    expect(eager).not.toContain('_astro/mapped.js');
  });

  it('is a subset of the full closure', () => {
    const entries = htmlRefs(SIGN_HTML);
    const full = fullClosure(view, entries);
    for (const file of staticClosure(view, pageEntries(SIGN_HTML))) expect(full.has(file)).toBe(true);
  });
});
