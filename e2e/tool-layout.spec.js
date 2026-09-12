import { test, expect } from '@playwright/test';

const toolRoutes = [
  '/merge',
  '/split',
  '/compress',
  '/pdf-to-image',
  '/image-to-pdf',
  '/unlock',
  '/sign',
  '/redact',
  '/edit-pdf',
];

test('aligns every tool title row with its breadcrumb grid at desktop width', async ({ page }) => {
  for (const route of toolRoutes) {
    await page.goto(route);

    const breadcrumbBrand = page.locator('body > div > div > a');
    const titleRow = page.locator('header > div').first();
    const hero = page.locator('header');
    const breadcrumbGrid = page.locator('body > div > div');
    await expect(breadcrumbBrand, route).toBeVisible();
    await expect(titleRow, route).toBeVisible();

    const [brandBox, rowBox, heroBox, gridBox] = await Promise.all([
      breadcrumbBrand.boundingBox(),
      titleRow.boundingBox(),
      hero.boundingBox(),
      breadcrumbGrid.boundingBox(),
    ]);
    if (!brandBox || !rowBox || !heroBox || !gridBox) {
      throw new Error(`${route}: breadcrumb or hero layout box is unavailable`);
    }

    // Shared desktop grid: the hero and app bar occupy the same 1080px frame,
    // while the title row and breadcrumb brand start at the same 24px inset.
    expect(Math.abs(heroBox.x - gridBox.x), route).toBeLessThanOrEqual(1);
    expect(Math.abs(heroBox.width - gridBox.width), route).toBeLessThanOrEqual(1);
    expect(Math.abs(rowBox.x - brandBox.x), route).toBeLessThanOrEqual(1);
  }
});

// Icon and title are flush top-aligned (zero margin on both, `items-start` on
// the row) rather than the icon being nudged down to centre against the
// title's first line - that looked fine for a one-line title but left the
// icon visibly adrift once a longer h1 (Compress's) wrapped to two or three
// lines and the eye compared the icon against the whole block. Only a real
// browser has line boxes: jsdom reports every rect as zero, and the
// regression this guards (the UA's `h1 { margin-block-start: 0.67em }`
// surviving because Tailwind's preflight is deliberately not imported)
// shifted the title down by 20.8px with no CSS of ours to point at. Range
// rects, not the <h1> box, isolate the first line's own top.
test('top-aligns each tool hero icon with the first line of its title', async ({ page }) => {
  for (const width of [1440, 1100, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of toolRoutes) {
      await page.goto(route);

      const measured = await page.evaluate(() => {
        const row = document.querySelector('header.tool-hero > div');
        const tile = row.firstElementChild.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(row.querySelector('h1'));
        const [firstLine] = range.getClientRects();
        return {
          lines: range.getClientRects().length,
          tileTop: tile.top,
          lineTop: firstLine.top,
        };
      });

      const where = `${route} @ ${width}px (${measured.lines} title line(s))`;
      expect(Math.abs(measured.tileTop - measured.lineTop), where).toBeLessThanOrEqual(4);
    }
  }
});

// ToolPageLayout.astro once held the hero+card wrapper to a full viewport
// `min-height` and centred #app inside it, which left up to 461px of blank
// space between the card and "How it works" at 1280x900 (viewport-driven,
// not content-driven). The page flows at its own height now; this guards
// that the card's bottom edge stays close to the very next section.
// `[class*="tool-card"]` matches the CSS-Modules-hashed class BasePdfTool
// renders (PdfTool.module.css).
test('keeps the tool card close to the section below it, not padded to the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const route of toolRoutes) {
    await page.goto(route);

    const card = page.locator('[class*="tool-card"]').first();
    await expect(card, route).toBeVisible();

    const gap = await page.evaluate(() => {
      const cardEl = document.querySelector('[class*="tool-card"]');
      const mainEl = document.querySelector('main');
      // The first <section> that comes after <main> in document order -
      // #app is a <section> too, but it's inside <main>, not after it.
      const nextSection = [...document.querySelectorAll('section')].find(
        (section) =>
          section.id !== 'app' &&
          !mainEl.contains(section) &&
          mainEl.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      if (!cardEl || !nextSection) return null;
      return nextSection.getBoundingClientRect().top - cardEl.getBoundingClientRect().bottom;
    });

    expect(gap, route).not.toBeNull();
    expect(gap, route).toBeLessThanOrEqual(140);
  }
});

// The same wrapper's `items-center` (below 1024px) centred a short card
// vertically on phones, so /compress-image/'s pre-result state jumped ~108px
// the instant a result made the page tall enough to stop being centred
// (backlog/tasks/SEO-25.md). The card sits directly under the hero now.
test('does not vertically centre a short tool card below the hero on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/compress-image/');

  const hero = page.locator('header');
  const card = page.locator('[class*="tool-card"]').first();
  await expect(card).toBeVisible();

  const [heroBox, cardBox] = await Promise.all([hero.boundingBox(), card.boundingBox()]);
  if (!heroBox || !cardBox) {
    throw new Error('/compress-image/: hero or tool card layout box is unavailable');
  }

  expect(Math.abs(cardBox.y - (heroBox.y + heroBox.height))).toBeLessThanOrEqual(40);
});

test('redaction guide images load without page overflow on desktop and mobile', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/blur-vs-blackout-vs-delete-pdf/');

    const figures = page.locator('main figure img');
    expect(await figures.count()).toBeGreaterThanOrEqual(3);
    for (const figure of await figures.all()) {
      await figure.scrollIntoViewIfNeeded();
      await expect.poll(() => figure.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
      const dimensions = await figure.evaluate((img) => ({
        expectedRatio: Number(img.getAttribute('width')) / Number(img.getAttribute('height')),
        actualRatio: img.naturalWidth / img.naturalHeight,
      }));
      expect(dimensions.actualRatio).toBeCloseTo(dimensions.expectedRatio, 2);
    }

    const pageOverflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(pageOverflows, `Guide overflows the ${width}px viewport`).toBe(false);
    // The guide carries more than one comparison table, so assert each of them
    // rather than a bare getByRole('table') - that resolves to several elements
    // and fails Playwright's strict mode rather than the layout it is checking.
    const tables = page.getByRole('table');
    expect(await tables.count()).toBeGreaterThanOrEqual(2);
    for (const table of await tables.all()) await expect(table).toBeVisible();
  }
});
