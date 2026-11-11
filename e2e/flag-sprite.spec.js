import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { flagSprite } from '../src/site-lib/flagSprite.ts';

// MEM-42: the rating board's flags are one file, /flags/notes.svg, and each flag is picked out of it by
// `#CODE` (a <view> in the sprite). Positioned views inside an <img> are the part that differs between
// engines, so this runs in chromium and webkit. The board itself is real only when the build read notes
// from the store (KV_REST_API_READ_ONLY_TOKEN), which a local build usually has not; the second test then
// proves the same thing on a sprite made from the real public/flags files, served at the real URL.

const flagFile = (code) => ({ code, svg: readFileSync(new URL(`../public/flags/${code}.svg`, import.meta.url), 'utf8') });

// What each flag img looks like once drawn. Not drawImage: a canvas ignores the `#CODE` fragment of an svg
// image and draws the whole sprite, so the picture is the element's screenshot, read back through a canvas.
async function look(page, img) {
  const png = (await img.screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data: Array.from(data) };
  }, png);
}
// The colour at a fraction of the picture, whatever the screen's pixel ratio.
const at = (p, fx, fy) => {
  const i = (Math.floor(fy * p.height) * p.width + Math.floor(fx * p.width)) * 4;
  return p.data.slice(i, i + 3);
};
const differ = (a, b) => a.width !== b.width || a.data.some((v, i) => v !== b.data[i]);
const loaded = (page, selector) => page.$$eval(selector, (els) => els.every((e) => e.complete && e.naturalWidth > 0));

test('the board asks for one flag file, and its flags are different pictures', async ({ page }) => {
  const flagRequests = [];
  page.on('request', (r) => {
    const { pathname } = new URL(r.url());
    if (pathname.startsWith('/flags/')) flagRequests.push(pathname);
  });
  await page.goto('/redact/');
  const imgs = page.locator('img[src^="/flags/notes.svg#"]');
  const count = await imgs.count();
  test.skip(count < 2, 'this build read no notes from the store, so the board has no flags');
  for (let i = 0; i < count; i++) await imgs.nth(i).scrollIntoViewIfNeeded();
  await expect.poll(() => loaded(page, 'img[src^="/flags/notes.svg#"]')).toBe(true);
  expect(flagRequests).toEqual(['/flags/notes.svg']);
  const seen = new Map();
  for (let i = 0; i < count; i++) {
    const src = await imgs.nth(i).getAttribute('src');
    if (!seen.has(src)) seen.set(src, await look(page, imgs.nth(i)));
  }
  expect(seen.size).toBeGreaterThan(1);
  const [first, ...rest] = [...seen.values()];
  for (const other of rest) expect(differ(first, other)).toBe(true);
});

test('a sprite of real flags shows each one in its own cell', async ({ page }) => {
  const sprite = flagSprite(['IN', 'KE', 'ES', 'BD'].map(flagFile));
  await page.route('**/flags/notes.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: sprite }));
  await page.route('**/flag-sprite-fixture/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: ['IN', 'KE', 'ES', 'BD'].map((c) => `<img class="f" src="/flags/notes.svg#${c}" width="36" height="24" alt="">`).join(''),
    }),
  );
  await page.goto('/flag-sprite-fixture/');
  await expect.poll(() => loaded(page, 'img.f')).toBe(true);
  const [india, kenya, spain, bangladesh] = await Promise.all([0, 1, 2, 3].map((i) => look(page, page.locator('img.f').nth(i))));
  for (const [a, b] of [[india, kenya], [india, spain], [kenya, spain], [spain, bangladesh], [india, bangladesh], [kenya, bangladesh]]) expect(differ(a, b)).toBe(true);
  // IN's top band is orange (#ff6820): it is IN's cell showing, not a neighbour's.
  const [r, g, b] = at(india, 0.5, 0.08);
  expect(r).toBeGreaterThan(220);
  expect(g).toBeGreaterThan(70);
  expect(g).toBeLessThan(150);
  expect(b).toBeLessThan(80);
  // ES's top band is red and BD's field green: both sources have a viewBox other than 0 0 513 342.
  const [sr, sg] = at(spain, 0.5, 0.05);
  expect(sr).toBeGreaterThan(150);
  expect(sg).toBeLessThan(90);
  const [br, bg] = at(bangladesh, 0.05, 0.05);
  expect(bg).toBeGreaterThan(br + 40);
});
