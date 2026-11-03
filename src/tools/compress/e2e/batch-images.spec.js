import { test, expect } from '@playwright/test';
import fs from 'fs';
import { waitForIsland } from '../../../../e2e/support/tool.js';

// COMP-04 - /compress-image/ takes several photos at once. The batch view's
// claims cannot be proven in jsdom: it has no JPEG encoder (so no real
// re-encode to a byte target), no multi-file picker, and no real downloads.
// This spec drives the real island in a real browser: three photos go in
// through one setInputFiles call, every row must land on the 50 KB target,
// and the bytes each row saves (and the rail's save-everything Download) are
// checked as real JPEGs, not component state.
//
// Fixtures are generated in-page with canvas (the drawing approach of
// image-target-size.spec.js), so no binary is committed. Row links are read by
// clicking them, as in that spec: fetch() on a blob: URL is blocked by the
// app's connect-src 'self'.
//
// Chromium only: nothing here is engine-specific.

const SIZES = [
  [1600, 1200],
  [1200, 1600],
  [1400, 1050],
];
const MIN_BYTES = 250 * 1024;
const TARGET_KB = 50;

async function makeJpeg(page, width, height) {
  const dataUrl = await page.evaluate(
    ({ width: w, height: h }) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#1b2a4a');
      gradient.addColorStop(0.5, '#3d6e91');
      gradient.addColorStop(1, '#e8c468');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 45; i += 1) {
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.fillStyle = `hsl(${Math.floor(Math.random() * 360)}, 70%, 55%)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 160, 40 + Math.random() * 160);
      }
      ctx.globalAlpha = 1;
      const noiseY = Math.floor(h * 0.6);
      const imageData = ctx.getImageData(0, noiseY, w, h - noiseY);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.6) {
          data[i] = Math.floor(Math.random() * 256);
          data[i + 1] = Math.floor(Math.random() * 256);
          data[i + 2] = Math.floor(Math.random() * 256);
        }
      }
      ctx.putImageData(imageData, 0, noiseY);
      return canvas.toDataURL('image/jpeg', 0.92);
    },
    { width, height },
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

test.describe('compress image - batch', () => {
  test('three photos compress to the target and save as real JPEGs', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Canvas fixtures and JPEG decoding only need checking once.');

    await page.goto('/compress-image/');
    await waitForIsland(page);

    const files = [];
    for (let i = 0; i < SIZES.length; i += 1) {
      const buffer = await makeJpeg(page, SIZES[i][0], SIZES[i][1]);
      // Too small and the photo would pass through untouched, proving nothing.
      expect(buffer.length).toBeGreaterThan(MIN_BYTES);
      files.push({ name: `photo-${i + 1}.jpg`, mimeType: 'image/jpeg', buffer });
    }

    await page.locator('input[type="file"]').setInputFiles(files);

    const rows = page.locator('li[data-batch-row]');
    await expect(rows).toHaveCount(3);
    const layout = page.locator('[data-compress-batch]');
    await expect(layout).toHaveAttribute('data-compress-status', 'done', { timeout: 60_000 });

    await page.getByRole('button', { name: `${TARGET_KB} KB`, exact: true }).click();
    // The summary names the target only once the whole set has finished at it, so the previous run's
    // "done" can never pass for this one.
    await expect(page.locator('[data-batch-summary]')).toContainText(`${TARGET_KB} KB`, { timeout: 60_000 });
    await expect(layout).toHaveAttribute('data-compress-status', 'done');
    await expect(rows).toHaveCount(3);

    const names = [];
    for (let i = 0; i < 3; i += 1) {
      const row = rows.nth(i);
      await expect(row).toHaveAttribute('data-outcome', 'met');
      const link = row.locator('a[data-batch-save]');
      await expect(link).toHaveAttribute('href', /^blob:/);
      names.push(await link.getAttribute('download'));

      const downloadPromise = page.waitForEvent('download');
      await link.click();
      const download = await downloadPromise;
      const bytes = fs.readFileSync(await download.path());
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
      expect(bytes.length).toBeLessThanOrEqual(TARGET_KB * 1024);
    }
    expect(new Set(names).size).toBe(3);

    const suggested = [];
    page.on('download', (d) => suggested.push(d.suggestedFilename()));
    await page.getByRole('button', { name: /^Download\b/ }).click();
    await expect.poll(() => suggested.length, { timeout: 10_000 }).toBe(3);
    expect([...suggested].sort()).toEqual([...names].sort());
  });
});
