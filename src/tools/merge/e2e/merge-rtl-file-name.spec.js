import { test, expect } from '@playwright/test';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';
import { waitForIsland } from '../../../../e2e/support/tool.js';

/* UX guideline 9 (Bidi is part of the design): the loaded heading is a file name,
   "merged_<first file>" + ".pdf". On /he/merge/ the page is RTL, and a ".pdf" outside any
   isolate lays out as "pdf." on the wrong side of the name ("pdf.merged_x"). This reads the
   heading's rendered order character by character with a Range, left to right, so it
   catches the reordering whatever markup produces it. */
test.use({ serviceWorkers: 'block' });

async function loadFiles(page, route, names) {
  const response = await page.goto(route);
  test.skip(!response || response.status() === 404, `${route} is not built`);
  await waitForIsland(page);
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

/* A name on a left-to-right page: the line reads left to right, so the name stays in its own
   direction and ".pdf" follows it on the right (Hebrew name or not). */
async function rename(page, text) {
  const name = page.locator('#page-grid-heading span[contenteditable]').first();
  await name.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(name).toContainText(text.slice(0, 5));
}

test('/merge/: a renamed Hebrew name keeps its direction, with ".pdf" on its right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await loadFiles(page, '/merge/', ['three-page-header.pdf', 'second.pdf']);
  await rename(page, 'טופס 1301');

  const order = await readVisualOrder(page);
  expect(order.parts.join(',').endsWith('name,ext,ext,ext,ext')).toBe(true);
  expect(order.text).toBe('1301 ספוט.pdf');
});

test('/merge/: a long Hebrew name cut in the middle still starts on the right, ".pdf" after it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await loadFiles(page, '/merge/', ['three-page-header.pdf', 'second.pdf']);
  const long = 'דוח שנתי מלא לשנת המס האחרונה של העסק';
  await rename(page, long);

  const order = await readVisualOrder(page);
  expect(order.text.endsWith('.pdf')).toBe(true);
  // Left to right, the name reads backwards: its last letter first, its first letter last.
  expect(order.text.slice(0, 3)).toBe([...long.slice(-3)].reverse().join(''));
  expect(order.text.slice(-7, -4)).toBe([...long.slice(0, 3)].reverse().join(''));
});

test('/merge/: a Hebrew file in the rail shows ".pdf" on its right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await loadFiles(page, '/merge/', ['חשבונית מרץ.pdf', 'second.pdf']);
  const row = page.locator('[title="חשבונית מרץ.pdf"]:visible').first();
  await expect(row).toBeVisible();
  const text = await row.evaluate((root) => {
    const chars = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let i = 0; i < node.length; i += 1) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        chars.push({ ch: node.data[i], left: range.getBoundingClientRect().left });
      }
    }
    return chars.sort((a, b) => a.left - b.left).map((c) => c.ch).join('');
  });
  expect(text).toBe('ץרמ תינובשח.pdf');
});

test('a long Hebrew name wrapped on a phone reads as one run, with no jump at the cut', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadFiles(page, '/merge/', ['three-page-header.pdf', 'second.pdf']);
  await rename(page, 'דוח שנתי מלא לשנת המס האחרונה של העסק הקטן ביותר');

  const lines = await page.evaluate(() => {
    const name = document.querySelector('#page-grid-heading span[contenteditable]');
    const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT);
    const chars = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let i = 0; i < node.length; i += 1) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0) chars.push({ at: chars.length, left: rect.left, top: Math.round(rect.top) });
      }
    }
    const tops = [...new Set(chars.map((c) => c.top))];
    return tops.map((top) => chars.filter((c) => c.top === top).sort((a, b) => b.left - a.left).map((c) => c.at));
  });
  expect(lines.length).toBeGreaterThan(1);
  // From the right edge of each line, the letters come in the order they were typed.
  for (const line of lines) expect(line).toEqual([...line].sort((a, b) => a - b));
});
