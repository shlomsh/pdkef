import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* UX guideline 9 (Bidi is part of the design): the loaded heading is a file name,
   "merged_<first file>" + ".pdf". On /he/merge/ the page is RTL, and a ".pdf" outside any
   isolate lays out as "pdf." on the wrong side of the name ("pdf.merged_x"). This reads the
   heading's rendered order character by character with a Range, left to right, so it
   catches the reordering whatever markup produces it. */
test.use({ serviceWorkers: 'block' });

async function makePdfBuffer(label) {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

async function loadFiles(page, route, names) {
  const response = await page.goto(route);
  test.skip(!response || response.status() === 404, `${route} is not built`);
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();
  const files = await Promise.all(names.map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page.locator('#page-grid-heading span[contenteditable]').first()).toBeVisible({ timeout: 10_000 });
}

/** The file name's characters in visual order, left to right, each tagged with where it came from. */
function readVisualOrder(page) {
  return page.evaluate(() => {
    const heading = document.getElementById('page-grid-heading');
    const name = heading.querySelector('span[contenteditable]');
    const ext = name.nextElementSibling ?? heading.querySelector('[class*="doc-heading-ext"]');
    const chars = [];
    for (const [part, el] of [['name', name], ['ext', ext]]) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let i = 0; i < node.length; i += 1) {
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          chars.push({ ch: node.data[i], part, left: rect.left });
        }
      }
    }
    chars.sort((a, b) => a.left - b.left);
    return { text: chars.map((c) => c.ch).join(''), parts: chars.map((c) => c.part), dir: getComputedStyle(heading).direction };
  });
}

for (const [route, dir] of [['/he/merge/', 'rtl'], ['/merge/', 'ltr']]) {
  test(`${route}: the loaded heading reads merged_<name>.pdf, extension last`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await loadFiles(page, route, ['three-page-header.pdf', 'second.pdf']);
    const order = await readVisualOrder(page);
    expect(order.dir).toBe(dir);
    expect(order.text).toBe('merged_three-page-header.pdf');
  });
}

test('/he/merge/: a renamed Hebrew name keeps the extension at its end, as ".pdf" on the left', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await loadFiles(page, '/he/merge/', ['three-page-header.pdf', 'second.pdf']);
  const name = page.locator('#page-grid-heading span[contenteditable]').first();
  await name.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('טופס 1301');
  await page.keyboard.press('Enter');
  await expect(name).toHaveText('טופס 1301');

  const order = await readVisualOrder(page);
  // An RTL name ends on the left: the extension sits left of every character of the name,
  // as ".pdf" (the dot first), never "pdf." tucked against the Hebrew.
  expect(order.parts.join(',').startsWith('ext,ext,ext,ext,name')).toBe(true);
  expect(order.text.startsWith('.pdf')).toBe(true);
});
