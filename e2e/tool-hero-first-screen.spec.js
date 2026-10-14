import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// HERO guard (docs/tool-hero-show-the-verb.md, "Guards"): on the eight page-grid tools the whole
// first screen fits the viewport at desktop sizes (h1, the sheet, Choose files), How it works sits
// below the fold, nothing overflows sideways and the verb animation shifts nothing. A file dropped
// on the hero's text column loads, a drag over the page lights the stage, and reduced motion stops
// the verb. jsdom has no layout, viewport, animation clock, layout-shift entries or media emulation,
// so none of this can be proved there.

const ROUTES = ['/merge/', '/split/', '/compress/', '/compress-image/', '/pdf-to-image/', '/image-to-pdf/', '/unlock/', '/edit-pdf/'];
const COMPACT = new Set(['/compress/', '/compress-image/']);
const ALL_SIZES = new Set(['/merge/', '/image-to-pdf/']);
const SIZES = [
  { width: 1280, height: 680, belowFold: true },
  { width: 1440, height: 820, belowFold: true },
  { width: 1920, height: 1040, belowFold: false },
];

const HYDRATED = 'astro-island:not([ssr]) [data-empty-state]';
const PICKER = '[data-empty-state] label:has(input[type="file"])';
const PDF = readFileSync(new URL('../src/lib/__fixtures__/num-1.pdf', import.meta.url));

async function open(page, route) {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch { /* private mode */ }
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(route);
  await expect(page.locator(HYDRATED), route).toBeVisible();
}

// Fully inside the viewport (a rect, not a text width).
async function expectInViewport(page, locator, label) {
  const box = await locator.boundingBox();
  const vp = page.viewportSize();
  expect(box, label).not.toBeNull();
  expect(box.x, `${label} left`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} top`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} right`).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height, `${label} bottom`).toBeLessThanOrEqual(vp.height);
}

test.describe('first screen', () => {
  for (const route of ROUTES) {
    const sizes = ALL_SIZES.has(route) ? SIZES : COMPACT.has(route) ? SIZES.slice(0, 2) : [SIZES[1]];
    for (const size of sizes) {
      test(`${route} at ${size.width}x${size.height}`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await open(page, route);
        await expectInViewport(page, page.locator('h1').first(), 'h1');
        await expectInViewport(page, page.locator('[data-empty-state]').first(), 'sheet');
        await expectInViewport(page, page.locator(PICKER).first(), 'Choose files');
        if (size.belowFold) {
          const top = await page.locator('#how-it-works').evaluate((el) => el.getBoundingClientRect().top);
          expect(top, 'How it works starts at or below the fold').toBeGreaterThanOrEqual(size.height);
        }
        // The hero sits high and centred in the first screen whatever the tool column does.
        const geo = await page.evaluate(() => {
          const hero = document.querySelector('.tool-hero').getBoundingClientRect();
          const stage = document.querySelector('.tool-stage').getBoundingClientRect();
          const main = document.querySelector('.tool-stage main').getBoundingClientRect();
          return { heroTop: hero.top, heroMid: hero.top + hero.height / 2, stageTop: stage.top, stageBottom: stage.bottom, mainBottom: main.bottom, h: innerHeight };
        });
        expect(geo.heroTop / geo.h, 'hero top as a share of the viewport').toBeLessThanOrEqual(0.45);
        expect(Math.abs(geo.heroMid - (geo.stageTop + Math.min(geo.h, geo.stageBottom)) / 2), 'hero centred in the first screen').toBeLessThanOrEqual(48);
        if (!COMPACT.has(route)) expect(geo.mainBottom, 'tool column ends within the first screen').toBeLessThanOrEqual(geo.h);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
        await page.waitForTimeout(2500);
        expect(await page.evaluate(() => window.__cls), 'layout shift while the verb plays').toBeLessThan(0.001);
      });
    }
  }
});

// Before the island's markup lays out, <main> is a few px tall; the hero must not move when it arrives.
for (const route of ['/merge/', '/compress-image/']) {
  test(`${route} shifts nothing under 6x CPU throttling`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await open(page, route);
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => window.__cls), 'layout shift').toBeLessThan(0.001);
  });
}

test('a file dropped on the hero text column loads in the tool', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await open(page, '/merge/');
  const dt = await page.evaluateHandle((bytes) => {
    const d = new DataTransfer();
    d.items.add(new File([new Uint8Array(bytes)], 'num-1.pdf', { type: 'application/pdf' }));
    return d;
  }, [...PDF]);
  const sub = page.locator('[data-hero-sub]').first();
  await sub.dispatchEvent('dragenter', { dataTransfer: dt });
  await expect(page.locator('[data-dragging]').first()).toBeVisible();
  await sub.dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.locator('[data-tool-loaded]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-dragging]')).toHaveCount(0);
  // A loaded tool leaves the two-column first screen for its own layout.
  expect(await page.locator('.tool-stage').first().evaluate((el) => getComputedStyle(el).display), 'loaded stage').not.toBe('grid');
});

for (const route of ['/merge/', '/unlock/']) {
  test(`reduced motion leaves ${route} verb still`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 820 });
    await open(page, route);
    await expect(page.locator('[data-empty-state] div[aria-hidden="true"]').first()).toBeVisible();
    await page.waitForTimeout(500);
    const running = await page.evaluate(() => {
      const root = document.querySelector('[data-empty-state]');
      return document.getAnimations().filter((a) => {
        const t = a.effect && a.effect.target;
        return t && root.contains(t) && a.playState === 'running';
      }).length;
    });
    expect(running, 'running animations in the sheet').toBe(0);
  });
}

test('dragging over the page lights the stage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await open(page, '/image-to-pdf/');
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }));
    return d;
  });
  const shadow = () => page.locator('.tool-stage').first().evaluate((el) => getComputedStyle(el).boxShadow);
  await page.locator('h1').first().dispatchEvent('dragenter', { dataTransfer: dt });
  await expect.poll(shadow).toContain('inset');
  await page.locator('h1').first().dispatchEvent('dragleave', { dataTransfer: dt });
  await expect.poll(shadow).not.toContain('inset');
});

// The measured cause of a 0.24 CLS in parallel runs (the stage flashed through its stacked layout
// before the empty state was parsed): the desktop grid keys on "nothing is loaded", never on the
// empty state's own element, so it holds while that element is absent (streaming parse) or is
// BasePdfTool's checking-draft placeholder (aria-busy, no data-empty-state).
for (const route of ['/merge/', '/split/']) {
  test(`${route} keeps the desktop grid while the empty state is missing or swapped for the placeholder`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await open(page, route);
    const probe = await page.evaluate(() => {
      const stage = document.querySelector('.tool-stage');
      const main = stage.querySelector('main');
      const hero = stage.querySelector('.tool-hero');
      const read = () => {
        const r = hero.getBoundingClientRect();
        return { display: getComputedStyle(stage).display, x: Math.round(r.x), width: Math.round(r.width) };
      };
      const before = read();
      const kids = [...main.childNodes];
      kids.forEach((n) => n.remove());
      const empty = read();
      kids.forEach((n) => main.append(n));
      const sheet = main.querySelector('[data-empty-state]');
      sheet.removeAttribute('data-empty-state');
      sheet.setAttribute('aria-busy', 'true');
      const placeholder = read();
      sheet.removeAttribute('aria-busy');
      sheet.setAttribute('data-empty-state', '');
      return { before, empty, placeholder };
    });
    expect(probe.before.display).toBe('grid');
    expect(probe.empty, 'main emptied').toEqual(probe.before);
    expect(probe.placeholder, 'sheet swapped for the placeholder').toEqual(probe.before);
  });
}

// Between 768 and 1023px the page stays stacked (the grid is 1024px and up): the verb stays small,
// Choose files is on the first screen and nothing overflows sideways.
for (const route of ['/merge/', '/compress/']) {
  test(`${route} stacks at 900x800 with a short verb and Choose files in view`, async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await open(page, route);
    expect(await page.locator('.tool-stage').first().evaluate((el) => getComputedStyle(el).display), 'stage').not.toBe('grid');
    // Compress draws no verb box in its sheet (its art is a plain icon), so it only has the rest to hold.
    const verbBox = page.locator('[data-empty-state] div[aria-hidden="true"]');
    if (route === '/merge/') {
      const verb = await verbBox.first().boundingBox();
      expect(verb.height, 'verb box height').toBeLessThanOrEqual(300);
    }
    await expectInViewport(page, page.locator(PICKER).first(), 'Choose files');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
  });
}

test('/merge/ on a landscape phone keeps Choose files within two screens', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await open(page, '/merge/');
  const top = await page.locator(PICKER).first().evaluate((el) => el.getBoundingClientRect().top);
  const h = await page.evaluate(() => innerHeight);
  expect(top, 'Choose files top').toBeLessThan(2 * h);
});

const RUNNING_IN_SHEET = () => {
  const root = document.querySelector('[data-empty-state]');
  return document.getAnimations().filter((a) => {
    const t = a.effect && a.effect.target;
    return t && root.contains(t) && a.playState === 'running';
  }).length;
};

test('the verb plays without reduced motion (positive control)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await open(page, '/merge/');
  await page.waitForTimeout(300);
  expect(await page.evaluate(RUNNING_IN_SHEET), 'running animations in the sheet').toBeGreaterThan(0);
});

test('reduced motion shows the last frame of the Merge verb', async ({ page, browser }) => {
  const PIECE = '[data-empty-state] div[aria-hidden="true"] > i';
  const translateOf = (p) => p.locator(PIECE).first().evaluate((el) => getComputedStyle(el).translate);
  await page.setViewportSize({ width: 1440, height: 820 });
  await open(page, '/merge/');
  await expect.poll(() => page.evaluate(RUNNING_IN_SHEET), { timeout: 8000 }).toBe(0);
  const finalFrame = await translateOf(page);
  expect(finalFrame, 'final translate is a real value').not.toBe('none');

  const still = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 820 } });
  const rpage = await still.newPage();
  await open(rpage, '/merge/');
  expect(await rpage.evaluate(RUNNING_IN_SHEET), 'running animations').toBe(0);
  expect(await translateOf(rpage), 'first piece sits at its final position').toBe(finalFrame);
  await still.close();
});

// A restored Merge workspace replaces the empty state with a document-sized one; the hero above it
// must not move or resize on the way, and nothing may shift.
test.describe('Merge restore', () => {
  test.use({ serviceWorkers: 'block' });
  test('keeps the hero the same height from first paint to the restored workspace', async ({ page, context }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 820 });
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await page.locator('input[type="file"]').setInputFiles(['num-1.pdf', 'num-2.pdf'].map((name) => ({
      name, mimeType: 'application/pdf', buffer: readFileSync(new URL(`../src/lib/__fixtures__/${name}`, import.meta.url)),
    })));
    await expect(page.locator('ul[class*="grid"] > li[data-key]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[class*="draft-status-row"]', { hasText: 'Draft saved' })).toBeVisible({ timeout: 15_000 });
    await page.close();

    const restored = await context.newPage();
    await restored.setViewportSize({ width: 1440, height: 820 });
    await restored.addInitScript(() => {
      window.__cls = 0;
      window.__heroHeights = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
      const sample = () => {
        const hero = document.querySelector('.tool-hero');
        if (hero) {
          const h = Math.round(hero.getBoundingClientRect().height * 2) / 2;
          if (window.__heroHeights[window.__heroHeights.length - 1] !== h) window.__heroHeights.push(h);
        }
      };
      new MutationObserver(sample).observe(document, { childList: true, subtree: true, attributes: true });
      const loop = () => { sample(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    await restored.goto('/merge/');
    await expect(restored.locator('ul[class*="grid"] > li[data-key]').first()).toBeVisible({ timeout: 15_000 });
    await restored.waitForTimeout(1500);
    const { cls, heights } = await restored.evaluate(() => ({ cls: window.__cls, heights: window.__heroHeights }));
    expect(heights.length, 'hero was sampled').toBeGreaterThan(0);
    expect(heights, 'hero height over the restore').toHaveLength(1);
    expect(cls, 'layout shift over the restore').toBeLessThan(0.01);
  });
});
