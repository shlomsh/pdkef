import { test, expect } from '@playwright/test';

// A recents tile stacks preview, name and up to three detail lines (tool,
// page count, age). The desktop row height is reserved from first paint, so a
// detail line added without room for it is clipped by the tile's own
// overflow: "Merge PDF / 5 pages / 2 days ago" came out cut off mid-line. This
// measures the rendered rects, which jsdom cannot, for the fullest tile the
// app produces (a Merge entry carries a page count) across the layouts.
const DAY = 24 * 60 * 60 * 1000;

const entries = () => ['merged_signed_test', 'merged_report', 'a', 'b', 'c', 'd'].map((name, i) => ({
  id: `sha256:tile-${i}`,
  tool: 'merge',
  fileName: name,
  pageCount: 5,
  savedAt: Date.now() - 2 * DAY - i * 1000,
}));

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 700 },
  { width: 800, height: 600 },
  { width: 390, height: 844 },
]) {
  test(`every recents tile line sits inside its tile at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript((recent) => {
      localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify(recent));
    }, entries());
    await page.goto('/');
    await expect(page.locator('#home-files li')).toHaveCount(6);

    const clipped = await page.evaluate(() => [...document.querySelectorAll('#home-files li')].flatMap((li) => {
      const tile = li.firstElementChild.getBoundingClientRect();
      return [...li.querySelectorAll('span')].flatMap((el) => {
        const r = el.getBoundingClientRect();
        // Cut off by the tile's box, or by the line's own overflow.
        const outside = r.bottom > tile.bottom + 0.5 || r.top < tile.top - 0.5;
        const truncated = el.scrollHeight > el.clientHeight + 1;
        return outside || truncated ? [`${el.textContent} (tile ${Math.round(tile.height)}px)`] : [];
      });
    }));
    expect(clipped).toEqual([]);
  });
}
