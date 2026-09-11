import { test, expect } from '@playwright/test';

// LOC-02: the one thing jsdom cannot prove about a localized tool page - that
// the shell actually mirrors under dir="rtl". Rendered rects only; copy and
// metadata are verify-seo.js's job.
//
// Needs a localized tool page in dist/. Until LOC-03 publishes one, that
// means a PDKEF_DOCS_PREVIEW=1 build (the draft fixture); a build without
// one skips rather than fails, so the ordinary CI build is unaffected.
test.use({ serviceWorkers: 'block' });

const PAGE = '/he/merge/';

test.beforeEach(async ({ page }) => {
  const response = await page.goto(PAGE);
  test.skip(
    !response || response.status() === 404,
    `${PAGE} is not built: publish a Hebrew tool edition or build with PDKEF_DOCS_PREVIEW=1`,
  );
});

test('the app bar, hero and file list mirror under dir="rtl"', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');

  // App bar: brand pill at the inline start (right), on-device badge pushed
  // to the inline end via ms-auto - the mirror of the English layout.
  const brand = page.locator('[data-home-bar], header, .sticky').first().locator('a[href="/"]').first();
  const badge = page.locator('[data-on-device]');
  const brandBox = await brand.boundingBox();
  const badgeBox = await badge.boundingBox();
  expect(brandBox.x, 'brand pill should sit to the right of the on-device badge in RTL').toBeGreaterThan(badgeBox.x);

  // Hero: the h1 is start-aligned, which in RTL means its right edge sits
  // right of the icon tile's left edge, not the other way round.
  const h1 = page.locator('h1');
  const h1Box = await h1.boundingBox();
  const page_width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(h1Box.x + h1Box.width, 'h1 should hug the right side of the page in RTL').toBeGreaterThan(page_width / 2);

  // Footer switcher: a <details> menu showing the current edition, listing
  // the other published one as a real anchor once opened.
  const switcher = page.locator('footer details[data-lang-menu]');
  await expect(switcher).toBeVisible();
  await expect(switcher.locator('summary')).toContainText('עברית');
  await switcher.locator('summary').click();
  await expect(switcher.locator('[aria-current="page"]')).toContainText('עברית');
  await expect(switcher.locator('a[href="/merge/"]')).toContainText('English');
});

test('a loaded file lists its row mirrored: handle at the inline start, remove at the inline end', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setInputFiles('input[type=file]', {
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>'),
  });
  const row = page.locator('li[data-id]').first();
  await expect(row).toBeVisible();
  const handle = await row.locator('[role="button"]').boundingBox();
  const remove = await row.locator('button').last().boundingBox();
  expect(handle.x, 'drag handle should be right of the remove button in RTL').toBeGreaterThan(remove.x);

  // The island is localized, not just the shell around it.
  await expect(page.locator('[role="toolbar"] button').first()).toHaveText('א–ת');
  await expect(page.locator('button', { hasText: 'הוסיפו עוד קובץ אחד כדי למזג' })).toBeVisible();
});

test('a localized page raises no CSP violation', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
    });
  });
  await page.goto(PAGE);
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});
