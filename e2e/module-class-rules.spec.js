import { test, expect } from '@playwright/test';

// MEM-37: client JS is bundled by the set of entries that load a module, which moves CSS Module class maps
// into shared files and leaves a stylesheet no page links. A static check cannot say whether a class a page
// really draws has its rule (a class map in a chunk proves nothing about what renders), so this reads the
// result in a browser: every CSS Module class on a rendered element, once the islands are hydrated, has a
// rule in a stylesheet or <style> the page carries.
test.use({ serviceWorkers: 'block' });

const PAGES = ['/', '/sign/', '/redact/', '/merge/', '/drive/'];

for (const route of PAGES) {
  test(`${route}: every CSS Module class on screen has a rule`, async ({ page }) => {
    await page.goto(route);
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
    const { used, missing } = await page.evaluate(() => {
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
    expect(used.length, 'the page draws CSS Module classes at all').toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
}
