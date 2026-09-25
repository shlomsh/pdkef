import { test, expect } from '@playwright/test';

// Guards MOBI-35 (backlog/tasks/MOBI-35.md): the desktop home launcher
// reserves two rows of recents (up to 6 files) from first paint, so neither
// the picker (`[data-home-picker]`) nor the recents list
// (`[data-home-recents] ul`) moves or resizes once real recents replace the
// one server-rendered placeholder tile. Also guards MOBI-37: the reserved
// rows are top-aligned with the hero demo's phone, and the picker sits
// directly under them. See .claude/rules/home-page.md.

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
