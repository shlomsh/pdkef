import { test, expect } from '@playwright/test';
import { makePdfBuffer } from './support/pdf.js';

// A person on a slow phone can tap "Choose file" and pick one while the island's script is still
// downloading: the server-rendered input is real and tappable, so the browser fires `change` into
// a page with no handler yet. Measured 2026-10-27 on slow 4G with a 4x CPU slowdown: the picker is
// tappable 0.9 to 1.1 s in and the island hydrates at 2.5 to 4.5 s, so Merge, Compress and Sign
// each had a 1.5 to 3.5 s window in which a chosen file was silently dropped (DEBT-64's cause).
// The shell reads whatever the input already holds when it mounts. Holding the scripts until the
// file is chosen is the only way to pick before hydration deterministically.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const routes = [
  '/merge/',
  '/split/',
  '/compress/',
  '/compress-image/',
  '/pdf-to-image/',
  '/image-to-pdf/',
  '/scan-to-pdf/',
  '/unlock/',
  '/sign/?next=0',
  '/redact/',
  '/organize-pdf/',
];

const EMPTY_PICKER = '[data-empty-state] input[type="file"]:not([capture])';

// Scan's "Take a photo" is the other server-rendered input: a photo taken early is kept too.
const pickers = [...routes.map((route) => ({ route, selector: EMPTY_PICKER, name: route })),
  { route: '/scan-to-pdf/', selector: '[data-empty-state] input[type="file"][capture]', name: '/scan-to-pdf/ camera input' }];

for (const { route, selector, name } of pickers) {
  test(`${name} keeps a file chosen before the island hydrates`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.clear(); } catch { /* private mode */ } });
    let releaseScripts;
    const scriptsHeld = new Promise((resolve) => { releaseScripts = resolve; });
    await page.route('**/_astro/*.js', async (request) => {
      await scriptsHeld;
      await request.continue();
    });
    // 'commit', not 'domcontentloaded': a held module script holds DOMContentLoaded back too.
    await page.goto(route, { waitUntil: 'commit' });
    const input = page.locator(selector).first();
    await input.waitFor({ state: 'attached' });
    expect(await page.locator('astro-island[client="load"][ssr]').count(), 'chosen before hydration').toBeGreaterThan(0);

    const accepted = (await input.getAttribute('accept')) ?? '';
    const file = accepted.includes('pdf')
      ? { name: 'early.pdf', mimeType: 'application/pdf', buffer: await makePdfBuffer('early') }
      : { name: 'early.png', mimeType: 'image/png', buffer: PNG };
    await input.setInputFiles(file);
    releaseScripts();

    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await expect(page.locator('[data-empty-state]')).toHaveCount(0, { timeout: 15_000 });
  });
}
