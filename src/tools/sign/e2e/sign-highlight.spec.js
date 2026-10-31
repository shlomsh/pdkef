import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/**
 * SIGN-46 (backlog/tasks/SIGN-46.md, docs/sign-highlight.md): the Highlight
 * tool lays a straight band on the text line under a swipe. The band finds the
 * line from the painted page pixels, so one path serves a digital PDF and a
 * scan. jsdom cannot prove where a band lands on the rendered page, so this
 * reads the page canvas for the real text rows and compares the band's rect.
 */

test.use({ serviceWorkers: 'block' });

const LINES = ['First line of the digital sample', 'Second line sits right below it', 'Third line closes the page'];

const digitalPdf = () => makePdfBuffer('Highlight digital', {
  lines: LINES.map((text, i) => ({ text, y: 700 - i * 40, size: 20 })),
});

/** A page that is only a picture of text, with slight speckle noise, like a scan. */
async function scannedPdf(page) {
  const png = await page.evaluate((lines) => {
    const c = document.createElement('canvas');
    c.width = 1224; c.height = 1584;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#111'; g.font = '44px sans-serif';
    lines.forEach((t, i) => g.fillText(t, 144, 300 + i * 90));
    const img = g.getImageData(0, 0, c.width, c.height);
    let seed = 7;
    for (let p = 0; p < img.data.length; p += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 97 === 0) { const v = 200 + (seed % 40); img.data[p] = img.data[p + 1] = img.data[p + 2] = v; }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  }, LINES);
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(Buffer.from(png, 'base64'));
  doc.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  return Buffer.from(await doc.save());
}

async function openPdf(page, buffer, name) {
  await page.goto('/sign/?next=0');
  await waitForIsland(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/pdf', buffer });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
}

/** The page's text rows as client-space boxes, read from the painted canvas. */
async function readInkRows(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const read = () => {
      const copy = document.createElement('canvas');
      copy.width = canvas.width; copy.height = canvas.height;
      const g = copy.getContext('2d');
      g.drawImage(canvas, 0, 0);
      return g.getImageData(0, 0, copy.width, copy.height);
    };
    const img = read();
    const { width, height, data } = img;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / width; const sy = rect.height / height;
    const rows = [];
    let cur = null;
    for (let y = 0; y <= height; y += 1) {
      let left = -1; let right = -1;
      if (y < height) {
        for (let x = 0; x < width; x += 1) {
          if (data[(y * width + x) * 4] < 100) { if (left < 0) left = x; right = x; }
        }
      }
      if (left >= 0) {
        cur = cur ? { ...cur, bottom: y, left: Math.min(cur.left, left), right: Math.max(cur.right, right) } : { top: y, bottom: y, left, right };
      } else if (cur) {
        if (cur.bottom - cur.top > 4) rows.push(cur);
        cur = null;
      }
    }
    return rows.map((r) => ({
      top: rect.top + r.top * sy, bottom: rect.top + (r.bottom + 1) * sy,
      left: rect.left + r.left * sx, right: rect.left + (r.right + 1) * sx,
    }));
  });
}

async function swipe(page, touch, from, to) {
  if (!touch) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const at = (p) => [{ x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at({ x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8 }) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

// Arming reserves the comments rail on a wide screen, which narrows the page: measure lines after it.
async function armHighlight(page) {
  await page.getByRole('toolbar', { name: 'PDF annotations' }).getByRole('button', { name: 'Highlight' }).click();
  const { width } = page.viewportSize();
  if (width >= 1000) await expect(page.locator('[data-comment-rail]').first()).toBeAttached();
}

const bandRects = (page) => page.locator('[data-editor-highlight] [data-highlight-band]')
  .evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));

const mid = (r) => (r.top + r.bottom) / 2;

async function expectNoText(page) {
  await expect(page.locator('[data-editor-text-input], textarea')).toHaveCount(0);
}

function expectOnLine(band, rows, index) {
  const line = rows[index];
  const overlap = Math.min(band.bottom, line.bottom) - Math.max(band.top, line.top);
  expect(overlap).toBeGreaterThan((line.bottom - line.top) * 0.6);
  if (rows[index - 1]) expect(band.top).toBeGreaterThanOrEqual(rows[index - 1].bottom - 1);
  if (rows[index + 1]) expect(band.bottom).toBeLessThanOrEqual(rows[index + 1].top + 1);
}

/** PDF.js paints asynchronously, so poll until all the text rows are on the canvas. */
async function inkRows(page) {
  await expect.poll(async () => (await readInkRows(page)).length).toBeGreaterThanOrEqual(3);
  return readInkRows(page);
}

const SIZES = [
  { name: 'desktop', touch: false, use: { viewport: { width: 1280, height: 900 } } },
  { name: 'phone', touch: true, use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
];

for (const { name, touch, use } of SIZES) {
  test.describe(`line band on ${name}`, () => {
    test.use(use);

    for (const kind of ['digital', 'scanned']) {
      test(`${kind}: a swipe along a line lays one band on that line`, async ({ page }) => {
        const buffer = kind === 'digital' ? await digitalPdf() : await (async () => { await page.goto('/sign/?next=0'); return scannedPdf(page); })();
        await openPdf(page, buffer, `${kind}.pdf`);
        await armHighlight(page);
        const rows = await inkRows(page);
        expect(rows.length).toBeGreaterThanOrEqual(3);
        const line = rows[1];
        await swipe(page, touch, { x: line.left + 2, y: mid(line) }, { x: line.right - 2, y: mid(line) });

        await expect(page.locator('[data-editor-highlight]')).toHaveCount(1);
        const bands = await bandRects(page);
        expect(bands).toHaveLength(1);
        expectOnLine(bands[0], rows, 1);
        expect(bands[0].right - bands[0].left).toBeGreaterThan((line.right - line.left) * 0.8);
        await expectNoText(page);
      });
    }

    test('digital: a swipe from line 1 down to line 2 lays two bands', async ({ page }) => {
      await openPdf(page, await digitalPdf(), 'two-lines.pdf');
      await armHighlight(page);
      const rows = await inkRows(page);
      await swipe(page, touch, { x: rows[0].left + 40, y: mid(rows[0]) }, { x: rows[1].right - 40, y: mid(rows[1]) });

      await expect(page.locator('[data-editor-highlight] [data-highlight-band]')).toHaveCount(2);
      const bands = (await bandRects(page)).sort((a, b) => a.top - b.top);
      expectOnLine(bands[0], rows, 0);
      expectOnLine(bands[1], rows, 1);
      await expectNoText(page);
    });
  });
}
