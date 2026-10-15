import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// HERO guard (docs/tool-hero-show-the-verb.md, "Guards"): on the ten tools (the eight page-grid tools,
// and Sign and Redact since HERO-05) the whole
// first screen fits the viewport at desktop sizes (h1, the sheet, Choose files), How it works sits
// below the fold, nothing overflows sideways and the verb animation shifts nothing. A file dropped
// on the hero's text column loads, a drag over the page lights the stage, and reduced motion stops
// the verb. jsdom has no layout, viewport, animation clock, layout-shift entries or media emulation,
// so none of this can be proved there.

const ROUTES = ['/merge/', '/split/', '/compress/', '/compress-image/', '/pdf-to-image/', '/image-to-pdf/', '/unlock/', '/edit-pdf/', '/sign/', '/redact/'];
const COMPACT = new Set(['/compress/', '/compress-image/']);
const ALL_SIZES = new Set(['/merge/', '/image-to-pdf/', '/split/', '/sign/']);
const SIZES = [
  { width: 1280, height: 680, belowFold: true },
  { width: 1440, height: 820, belowFold: true },
  { width: 1920, height: 1040, belowFold: false },
];

const HYDRATED = 'astro-island:not([ssr]) [data-empty-state]';
const PICKER = '[data-empty-state] label:has(input[type="file"])';
const PDF = readFileSync(new URL('../src/lib/__fixtures__/num-1.pdf', import.meta.url));
const JPG = readFileSync(new URL('../src/lib/__fixtures__/photo-1.jpg', import.meta.url));

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
    const sizes = ALL_SIZES.has(route) ? SIZES : COMPACT.has(route) ? SIZES : [SIZES[1]];
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
        // Compress's column measures 746px: it fits 820 and up, not the 680px laptop screen.
        if (!COMPACT.has(route) || size.height >= 820) expect(geo.mainBottom, 'tool column ends within the first screen').toBeLessThanOrEqual(geo.h);
        await page.waitForTimeout(2500);
        expect(await page.evaluate(() => window.__cls), 'layout shift while the verb plays').toBeLessThan(0.001);
        // Vertical balance: the sheet's content sits centred in the sheet, and the compact tools'
        // text group centres against their picture and the column against the hero.
        const bal = await page.evaluate(() => {
          const R = (e) => e.getBoundingClientRect();
          const sheet = document.querySelector('[data-empty-state]');
          const s = R(sheet);
          const shown = [...sheet.children].filter((k) => getComputedStyle(k).display !== 'none' && R(k).height > 0);
          const span = (els) => ({ top: Math.min(...els.map((k) => R(k).top)), bottom: Math.max(...els.map((k) => R(k).bottom)) });
          const all = span(shown);
          const text = shown.length > 1 ? span(shown.slice(1)) : all;
          const pic = R(shown[0]);
          const hero = R(document.querySelector('.tool-hero'));
          let colBottom = 0;
          for (const e of document.querySelectorAll('.tool-stage main *')) {
            const er = R(e);
            if (er.height && getComputedStyle(e).display !== 'none' && er.bottom > colBottom) colBottom = er.bottom;
          }
          return {
            gapAbove: all.top - s.top,
            gapBelow: s.bottom - all.bottom,
            textMid: (text.top + text.bottom) / 2,
            picMid: pic.top + pic.height / 2,
            heroMid: hero.top + hero.height / 2,
            colMid: (s.top + colBottom) / 2,
          };
        });
        expect(Math.abs(bal.gapAbove - bal.gapBelow), `sheet gap above ${bal.gapAbove} vs below ${bal.gapBelow}`).toBeLessThanOrEqual(6);
        if (COMPACT.has(route)) {
          expect(Math.abs(bal.textMid - bal.picMid), `text group centre ${bal.textMid} vs picture centre ${bal.picMid}`).toBeLessThanOrEqual(6);
          if (geo.mainBottom <= geo.h) expect(Math.abs(bal.heroMid - bal.colMid), `hero centre ${bal.heroMid} vs column centre ${bal.colMid}`).toBeLessThanOrEqual(24);
        }
        // After the verb's last frame: Split's decks only reach their widest once they have parted.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
      });
    }
  }
});

// The sheet (<main> is top-aligned so late content shifts nothing) is centred in the first screen by
// a static margin, so its centre sits with the hero's, not high above it on a tall screen. Compress
// and Compress Image have a column taller than the screen and keep margin 0.
for (const route of ROUTES.filter((r) => !COMPACT.has(r))) {
  for (const size of SIZES) {
    test(`${route} sheet is centred with the hero at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await open(page, route);
      const mids = await page.evaluate(() => {
        const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
        return { hero: mid(document.querySelector('.tool-hero')), sheet: mid(document.querySelector('.tool-stage [data-empty-state]')) };
      });
      expect(Math.abs(mids.sheet - mids.hero), `sheet centre ${mids.sheet} vs hero centre ${mids.hero}`).toBeLessThanOrEqual(48);
    });
  }
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
for (const route of ['/merge/', '/split/', '/sign/', '/redact/']) {
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

// Below 1024px the page stays stacked (the grid is 1024px and up): the verb stays small,
// Choose files is on the first screen and nothing overflows sideways, checked after the verb's
// last frame (Split's decks are widest once parted; at 390px they once scrolled the page 32px).
for (const [route, width, height] of [['/merge/', 900, 800], ['/compress/', 900, 800], ['/split/', 900, 800], ['/split/', 390, 844]]) {
  test(`${route} stacks at ${width}x${height} with a short verb and Choose files in view`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page, route);
    expect(await page.locator('.tool-stage').first().evaluate((el) => getComputedStyle(el).display), 'stage').not.toBe('grid');
    const verb = await page.locator('[data-empty-state] div[aria-hidden="true"]').first().boundingBox();
    expect(verb.height, 'verb box height').toBeLessThanOrEqual(300);
    await expectInViewport(page, page.locator(PICKER).first(), 'Choose files');
    await page.waitForTimeout(2500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
  });
}

// HERO-05: Sign and Redact carry the desktop first screen's markup at every width (the static HTML is
// one document), so below 1024px each of its rules must be off: the stage stays a stack, the hero is
// the row it always was (name and rest read as one inline line), the airplane line sits between the
// hero and the card, and the How it works link is hidden. Phone Sign belongs to docs/sign-next-gen.md.
for (const route of ['/sign/', '/redact/']) {
  for (const [width, height] of [[390, 844], [768, 1024], [1023, 768]]) {
    test(`${route} below the desktop first screen is unchanged at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, route);
      const probe = await page.evaluate(() => {
        const stage = document.querySelector('.tool-stage');
        const hero = document.querySelector('.tool-hero');
        const note = document.querySelector('[data-airplane-note]');
        const main = stage.querySelector('main');
        const R = (e) => e.getBoundingClientRect();
        const following = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        return {
          display: getComputedStyle(stage).display,
          stacked: hero.hasAttribute('data-hero-stacked'),
          name: getComputedStyle(hero.querySelector('[data-hero-name]')).display,
          rest: getComputedStyle(hero.querySelector('[data-hero-rest]')).display,
          domOrder: following(hero, note) && following(note, main),
          visualOrder: R(hero).bottom <= R(note).top + 0.5 && R(note).bottom <= R(main).top + 0.5,
          how: getComputedStyle(document.querySelector('[data-how-link]')).display,
        };
      });
      expect(probe.display, 'stage').not.toBe('grid');
      expect(probe.stacked, 'data-hero-stacked stays off').toBe(false);
      expect(probe.name, 'name span').toBe('inline');
      expect(probe.rest, 'rest span').toBe('inline');
      expect(probe.domOrder, 'DOM order hero, note, card').toBe(true);
      expect(probe.visualOrder, 'visual order hero, note, card').toBe(true);
      expect(probe.how, 'How it works link').toBe('none');
    });
  }
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

// A hand-off (the home launcher, Merge to Compress, Redact to Unlock) is read from IndexedDB, which
// the pre-paint script cannot see. saveHandoff therefore also leaves a sessionStorage key
// (src/lib/handoffPending.ts) that sets html[data-handoff-pending] before first paint, and the page
// holds the loaded layout from the start. Measured before the marker: a file landed 100-300ms after
// the empty two-column first screen had painted, CLS 0.32 at 1440x820.
const SAMPLE_HERO = () => {
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
};

test.describe('hand-off arrival', () => {
  test.use({ serviceWorkers: 'block' });

  for (const tool of ['split', 'compress', 'compress-image']) test(`the home launcher to ${tool} lands loaded with one hero height and no layout shift`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 820 });
    await page.addInitScript(SAMPLE_HERO);
    await page.goto('/');
    await page.locator('[data-home-picker]').first().waitFor();
    const fits = page.locator(`.home-dock a[data-tool="${tool}"][data-fits]`);
    // The drop listener is registered a paint after the picker renders: drop until the dock lights Split.
    await expect(async () => {
      const dt = await page.evaluateHandle(({ bytes, name, type }) => {
        const d = new DataTransfer();
        d.items.add(new File([new Uint8Array(bytes)], name, { type }));
        return d;
      }, tool === 'compress-image'
        ? { bytes: [...JPG], name: 'photo-1.jpg', type: 'image/jpeg' }
        : { bytes: [...PDF], name: 'num-1.pdf', type: 'application/pdf' });
      await page.locator('[data-working-area]').first().dispatchEvent('drop', { dataTransfer: dt });
      await expect(fits).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    // Capture the pre-paint decision on the destination page: the marker must be on html before any
    // file shows (a key under the wrong slug leaves it unset and the layout shifts on arrival).
    await page.addInitScript(() => {
      if (location.pathname === '/') return;
      window.__pendingSeen = false;
      new MutationObserver(() => {
        if (document.documentElement.hasAttribute('data-handoff-pending')) window.__pendingSeen = true;
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-handoff-pending'] });
    });
    await fits.click();
    await page.waitForURL(new RegExp(`/${tool}/?$`));
    await expect(page.locator('[data-tool-loaded], [data-tool-shell]').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.__pendingSeen), 'marker set before the file showed').toBe(true);
    const { cls, heights, pending, key } = await page.evaluate((t) => ({
      cls: window.__cls,
      heights: window.__heroHeights,
      pending: document.documentElement.hasAttribute('data-handoff-pending'),
      key: sessionStorage.getItem('pdkef:handoff-pending:' + t),
    }), tool);
    expect(heights, 'hero height from first paint to the loaded tool').toHaveLength(1);
    expect(cls, 'layout shift over the hand-off').toBeLessThan(0.01);
    expect(pending, 'the pending attribute is released once the file shows').toBe(false);
    expect(key, 'the one-shot storage key is consumed').toBeNull();
  });

  test('a stale marker with no stored hand-off releases and shows the empty first screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await page.addInitScript(() => {
      try { sessionStorage.setItem('pdkef:handoff-pending:compress', '1'); } catch { /* private mode */ }
    });
    await page.addInitScript(SAMPLE_HERO);
    await page.goto('/compress/');
    await expect(page.locator(HYDRATED)).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-handoff-pending', /.*/);
    expect(await page.evaluate(() => sessionStorage.getItem('pdkef:handoff-pending:compress')), 'stale key cleared').toBeNull();
    expect(await page.locator('.tool-stage').first().evaluate((el) => getComputedStyle(el).display), 'empty first screen').toBe('grid');
    await page.waitForTimeout(500);
    // Releasing moves the condensed hero to its centred place in the grid: one move, measured 0.049
    // at 1440x820. A stale key needs a hand-off whose navigation never finished, so it is allowed
    // that one shift and no more (the tool column is hidden until the release, so it adds none).
    expect(await page.evaluate(() => window.__cls), 'layout shift releasing a stale marker').toBeLessThan(0.06);
  });
});

// The sheet's end edge is the column's end edge: the How it works link ends at the column edge, so
// the sheet (main) must end there too, not 48px short of it.
for (const [route, dir] of [['/merge/', 'ltr'], ['/he/merge/', 'rtl']]) {
  test(`${route} sheet ends at the column edge (${dir})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await open(page, route);
    const edges = await page.evaluate(() => {
      const sheet = document.querySelector('.tool-stage [data-empty-state]').getBoundingClientRect();
      const link = document.querySelector('[data-how-link]').getBoundingClientRect();
      return { sheetLeft: sheet.left, sheetRight: sheet.right, linkLeft: link.left, linkRight: link.right };
    });
    if (dir === 'ltr') expect(Math.abs(edges.sheetRight - edges.linkRight), 'sheet right vs link right').toBeLessThanOrEqual(1);
    else expect(Math.abs(edges.sheetLeft - edges.linkLeft), 'sheet left vs link left').toBeLessThanOrEqual(1);
  });
}

// On a phone the stage reaches the bottom edge on first paint: the next section's off-white
// background must not show as a band under a short tool (Merge ended 145px short at 393x852).
test.describe('phone first screen fills the viewport', () => {
  for (const route of ROUTES) {
    for (const [width, height] of [[393, 852], [375, 667]]) {
      test(`${route} stage reaches the bottom edge at ${width}x${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await open(page, route);
        const bottom = await page.locator('.tool-stage').evaluate((el) => el.getBoundingClientRect().bottom);
        expect(bottom, 'stage bottom against the viewport').toBeGreaterThanOrEqual(height - 1);
        await page.waitForTimeout(1500);
        expect(await page.evaluate(() => window.__cls), 'layout shift on first load').toBeLessThan(0.001);
      });
    }
  }
});
