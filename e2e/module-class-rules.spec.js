import { test, expect } from '@playwright/test';
import { makePdfBuffer } from './support/pdf.js';
import { waitForIsland } from './support/tool.js';

// MEM-37: client JS is bundled by the set of entries that load a module, which moves CSS Module class maps
// into shared files and leaves a stylesheet no page links. A static check cannot say whether a class a page
// really draws has its rule (a class map in a chunk proves nothing about what renders), so this reads the
// result in a browser: every CSS Module class on a rendered element, once the islands are hydrated, has a
// rule in a stylesheet or <style> the page carries.
test.use({ serviceWorkers: 'block' });

const FIRST_RENDER = ['/', '/sign/', '/redact/', '/merge/', '/drive/', '/compress/', '/split/', '/highlight-pdf/', '/he/sign/'];

// Each tool's loaded state, by a locator its own specs wait on.
const LOADED = [
  { route: '/sign/?next=0', ready: '[class*="page-overlay"]' },
  { route: '/redact/', ready: '.redact-draw-area' },
  { route: '/highlight-pdf/', ready: '[data-page-overlay]' },
  { route: '/merge/', ready: 'ul[data-page-grid]' },
  { route: '/compress/', ready: '[data-compress-status="done"]' },
  { route: '/split/', ready: 'ul[data-page-grid][data-fit-settled]' },
];

// The CSS Module classes on screen, and those with no rule in any stylesheet the page carries.
const moduleClasses = (page) => page.evaluate(() => {
  const MODULE_CLASS = /^_[A-Za-z][\w-]*?_[0-9a-f]{6}$/;
  const IN_RULE = /\._[A-Za-z][\w-]*?_[0-9a-f]{6}(?![\w-])/g;
  const ruled = new Set();
  const collect = (rules) => {
    for (const rule of rules) {
      for (const found of rule.cssText.match(IN_RULE) ?? []) ruled.add(found.slice(1));
    }
  };
  for (const sheet of document.styleSheets) collect(sheet.cssRules);
  const used = new Set();
  for (const el of document.querySelectorAll('[class]')) {
    for (const name of el.classList) if (MODULE_CLASS.test(name)) used.add(name);
  }
  return { used: [...used], missing: [...used].filter((name) => !ruled.has(name)) };
});

async function hydrated(page, route) {
  await page.goto(route);
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  // Hydration can finish a tick before the island paints its first module class.
  await page.waitForFunction(() => [...document.querySelectorAll('[class]')].some((el) => /(^|\s)_[A-Za-z][\w-]*?_[0-9a-f]{6}(\s|$)/.test(el.getAttribute('class'))));
}

for (const route of FIRST_RENDER) {
  test(`${route}: every CSS Module class on screen has a rule`, async ({ page }) => {
    await hydrated(page, route);
    const { used, missing } = await moduleClasses(page);
    expect(used.length, 'the page draws CSS Module classes at all').toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
}

test.describe('after a file is opened', () => {
  for (const { route, ready } of LOADED) {
    test(`${route}: every CSS Module class on screen has a rule`, async ({ page }) => {
      await hydrated(page, route);
      const before = (await moduleClasses(page)).used;
      await waitForIsland(page);
      await page.locator('input[type="file"]').first().setInputFiles({
        name: 'class-rules.pdf',
        mimeType: 'application/pdf',
        buffer: await makePdfBuffer('class rules', { pages: 2 }),
      });
      await page.locator(ready).first().waitFor({ timeout: 30_000 });
      const { used, missing } = await moduleClasses(page);
      expect(used.length, `the loaded state draws more module classes than the first render (${before.length})`).toBeGreaterThan(before.length);
      console.log(`${route} first render ${before.length}, loaded ${used.length}`);
      expect(missing).toEqual([]);
    });
  }
});
