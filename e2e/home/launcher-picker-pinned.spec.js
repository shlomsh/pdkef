import { test, expect } from '@playwright/test';

// Guards MOBI-35 (backlog/tasks/MOBI-35.md): the desktop home launcher
// reserves two rows of recents (up to 6 files) from first paint, so neither
// the picker (`[data-home-picker]`) nor the recents list
// (`[data-home-recents] ul`) moves or resizes once real recents replace the
// one server-rendered placeholder tile. Also guards MOBI-37: the reserved
// rows are top-aligned with the hero demo's phone, and the picker sits
// directly under them. Also guards MOBI-36: tablets (768-1023px wide) reserve
// the same two rows without shifting the picker, and short desktop windows
// keep recents tiles tall enough to read instead of squashing them. See
// .claude/rules/home-page.md.

async function seedRecentFiles(page, entries) {
  await page.addInitScript((recentFiles) => {
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify(recentFiles));
  }, entries);
}

function makeRecents(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `sha256:recent-${index}`,
    tool: 'sign',
    fileName: `recent-${index}.pdf`,
    savedAt: Date.now() - index * 1000,
  }));
}

// Samples the picker's, the recents list's and its first tile's boxes on the
// first animation frame where they exist - essentially first paint, since this installs via
// addInitScript before any page script runs - plus a buffered
// PerformanceObserver summing every layout-shift entry for the whole load.
// Both signals are read again once the page has settled and compared against
// this first sample.
async function installShiftSampler(page) {
  await page.addInitScript(() => {
    window.__firstRects = null;
    window.__clsSum = 0;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__clsSum += entry.value;
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // layout-shift unsupported (non-Chromium); the CLS assertion below
      // stays trivially true (0 < 0.005) and the rect assertions still run.
    }
    const boxOf = (el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const sample = () => {
      const picker = document.querySelector('[data-home-picker]');
      const list = document.querySelector('[data-home-recents] ul');
      const tile = list?.querySelector('li');
      if (picker && tile && !window.__firstRects) {
        window.__firstRects = { picker: boxOf(picker), list: boxOf(list), tile: boxOf(tile) };
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function readRects(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const picker = document.querySelector('[data-home-picker]');
    const list = document.querySelector('[data-home-recents] ul');
    const hero = document.querySelector('header.hero-header');
    const dock = document.querySelector('nav.home-dock');
    const thumb = document.querySelector('[data-home-recents] li [class*="_preview_"]');
    const phone = document.querySelector('[data-hero-track="sign"] [class*="_phone_"]');
    return {
      firstRects: window.__firstRects,
      settledRects: { picker: box(picker), list: box(list), tile: box(list.querySelector('li')) },
      clsSum: window.__clsSum,
      heroBottom: hero ? hero.getBoundingClientRect().bottom : null,
      dockTop: dock ? dock.getBoundingClientRect().top : null,
      thumbTop: thumb ? thumb.getBoundingClientRect().top : null,
      phoneTop: phone ? phone.getBoundingClientRect().top : null,
      rowGap: picker ? parseFloat(getComputedStyle(picker.parentElement).rowGap) : null,
    };
  });
}

function expectStableBox(settled, first) {
  expect(Math.abs(settled.x - first.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(settled.y - first.y)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(settled.width - first.width)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(settled.height - first.height)).toBeLessThanOrEqual(0.5);
}

const DESKTOP_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];
const RECENT_COUNTS = [1, 6];
// MOBI-36: tablets reserve the same two rows as desktop, just narrower.
const TABLET_VIEWPORTS = [
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  // Short enough that the first screen grows; the worst case before MOBI-36.
  { width: 800, height: 600 },
];
// MOBI-36: a short desktop window used to squash recents tiles.
const SHORT_DESKTOP_VIEWPORTS = [
  { width: 1280, height: 600 },
  { width: 1366, height: 625 },
];
// 0 = don't seed at all, so the launcher shows only the bundled placeholder
// tile; 6 is the full recents row. Both must leave the picker on the first
// screen since the recents area now scrolls internally instead of pushing it
// out of the launcher cell.
const SHORT_DESKTOP_COUNTS = [0, 6];
const PHONE_VIEWPORT = { width: 390, height: 844 };
// Five recents is the two-row case that used to move the picker on desktop.
const PHONE_RECENTS = makeRecents(5);

test.describe('home launcher picker and recents stay pinned as recents load', () => {
  for (const viewport of DESKTOP_VIEWPORTS) {
    for (const count of RECENT_COUNTS) {
      test(`picker and recents list are unchanged from first frame to settled layout at ${viewport.width}x${viewport.height} with ${count} recent${count === 1 ? '' : 's'}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await seedRecentFiles(page, makeRecents(count));
        await installShiftSampler(page);
        await page.goto('/');

        await expect(page.locator('#home-files li')).toHaveCount(count);
        // At 1 recent the placeholder already matches the count; wait for the real tile.
        await expect(page.locator('#home-files li').last()).toContainText(`recent-${count - 1}.pdf`);
        // Give any late reflow (fonts, images) a moment to settle before
        // reading the final rects.
        await page.waitForTimeout(300);

        const result = await readRects(page);

        testInfo.annotations.push({ type: 'picker-recents-rects', description: JSON.stringify(result) });

        expect(result.firstRects).not.toBeNull();
        expectStableBox(result.settledRects.picker, result.firstRects.picker);
        expectStableBox(result.settledRects.list, result.firstRects.list);
        // The placeholder's slot is the first real recent's slot.
        expectStableBox(result.settledRects.tile, result.firstRects.tile);
        expect(result.clsSum).toBeLessThan(0.005);

        // The reserved two rows must not overlap the headline above, and the
        // picker must clear the tool dock below.
        expect(result.settledRects.list.y).toBeGreaterThanOrEqual(result.heroBottom);
        expect(result.dockTop - (result.settledRects.picker.y + result.settledRects.picker.height)).toBeGreaterThanOrEqual(16);

        // The first recents thumbnail's top lines up with the demo phone's
        // (MOBI-37), and the picker sits directly under the reserved rows.
        expect(Math.abs(result.thumbTop - result.phoneTop)).toBeLessThanOrEqual(1);
        const listBottom = result.settledRects.list.y + result.settledRects.list.height;
        expect(Math.abs(result.settledRects.picker.y - (listBottom + result.rowGap))).toBeLessThanOrEqual(1);
      });
    }
  }

  // MOBI-36: tablets (768-1023px wide) reserve the same two rows as desktop.
  // The demo sits below the launcher there, so thumbnail/phone alignment and
  // dock clearance aren't asserted, just rect stability and picker placement.
  for (const viewport of TABLET_VIEWPORTS) {
    for (const count of RECENT_COUNTS) {
      test(`picker and recents list are unchanged from first frame to settled layout at tablet ${viewport.width}x${viewport.height} with ${count} recent${count === 1 ? '' : 's'}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await seedRecentFiles(page, makeRecents(count));
        await installShiftSampler(page);
        await page.goto('/');

        await expect(page.locator('#home-files li')).toHaveCount(count);
        await expect(page.locator('#home-files li').last()).toContainText(`recent-${count - 1}.pdf`);
        await page.waitForTimeout(300);

        const result = await readRects(page);

        testInfo.annotations.push({ type: 'tablet-picker-recents-rects', description: JSON.stringify(result) });

        expect(result.firstRects).not.toBeNull();
        expectStableBox(result.settledRects.picker, result.firstRects.picker);
        expectStableBox(result.settledRects.list, result.firstRects.list);
        expectStableBox(result.settledRects.tile, result.firstRects.tile);
        expect(result.clsSum).toBeLessThan(0.005);

        const listBottom = result.settledRects.list.y + result.settledRects.list.height;
        expect(Math.abs(result.settledRects.picker.y - (listBottom + result.rowGap))).toBeLessThanOrEqual(1);
      });
    }
  }

  // MOBI-36: a short desktop window must not squash recents tiles down to
  // clipped, unreadable rows, and the recents area must scroll internally
  // rather than push the picker off the first screen - with either an empty
  // cache (the bundled placeholder tile) or a full row of 6 recents.
  for (const viewport of SHORT_DESKTOP_VIEWPORTS) {
    for (const count of SHORT_DESKTOP_COUNTS) {
      test(`recents tiles stay readable and the picker stays hittable on the first screen at ${viewport.width}x${viewport.height} with ${count} recent${count === 1 ? '' : 's'}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        if (count > 0) await seedRecentFiles(page, makeRecents(count));
        await installShiftSampler(page);
        await page.goto('/');

        // 0 recents still renders one li: the bundled placeholder tile.
        const expectedLiCount = count > 0 ? count : 1;
        await expect(page.locator('#home-files li')).toHaveCount(expectedLiCount);
        if (count > 0) {
          await expect(page.locator('#home-files li').last()).toContainText(`recent-${count - 1}.pdf`);
        }
        await page.waitForTimeout(300);

        const result = await readRects(page);

        testInfo.annotations.push({ type: 'short-desktop-rects', description: JSON.stringify(result) });

        expect(result.firstRects).not.toBeNull();
        expectStableBox(result.settledRects.picker, result.firstRects.picker);
        expectStableBox(result.settledRects.list, result.firstRects.list);
        expect(result.clsSum).toBeLessThan(0.005);

        const tileMetrics = await page.evaluate(() => {
          const previews = Array.from(document.querySelectorAll('[data-home-recents] li [class*="_preview_"]'));
          const buttons = Array.from(document.querySelectorAll('[data-home-recents] li button'));
          return {
            previewHeights: previews.map((el) => el.getBoundingClientRect().height),
            clippedButtons: buttons.filter((btn) => btn.scrollHeight > btn.clientHeight + 1).length,
          };
        });

        for (const height of tileMetrics.previewHeights) {
          expect(height).toBeGreaterThanOrEqual(40);
        }
        expect(tileMetrics.clippedButtons).toBe(0);

        // The picker must stay on the first screen: hittable at its own rect
        // centre, and not pushed below the viewport's bottom edge.
        const pickerHit = await page.evaluate(() => {
          const picker = document.querySelector('[data-home-picker]');
          const rect = picker.getBoundingClientRect();
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;
          const hitsPicker = document.elementFromPoint(centerX, centerY)?.closest('[data-home-picker]') != null;
          return { hitsPicker, bottom: rect.bottom, innerHeight: window.innerHeight };
        });

        expect(pickerHit.hitsPicker).toBe(true);
        expect(pickerHit.bottom).toBeLessThanOrEqual(pickerHit.innerHeight);
      });
    }
  }

  // Phones don't reserve two rows (their first screen grows instead), so only
  // the picker's own stability and CLS matter here.
  test(`picker box is unchanged from first frame to settled layout at ${PHONE_VIEWPORT.width}x${PHONE_VIEWPORT.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await seedRecentFiles(page, PHONE_RECENTS);
    await installShiftSampler(page);
    await page.goto('/');

    await expect(page.locator('#home-files li')).toHaveCount(PHONE_RECENTS.length);
    await page.waitForTimeout(300);

    const result = await readRects(page);

    testInfo.annotations.push({ type: 'picker-rect', description: JSON.stringify(result) });

    expect(result.firstRects).not.toBeNull();
    expectStableBox(result.settledRects.picker, result.firstRects.picker);
    expect(result.clsSum).toBeLessThan(0.005);
  });
});
