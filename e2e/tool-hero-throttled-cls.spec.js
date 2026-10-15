import { test, expect } from '@playwright/test';

// HERO guard (docs/tool-hero-show-the-verb.md, "Guards"): the hero shifts nothing while the tool
// island arrives on a slow CPU. Split out of tool-hero-first-screen.spec.js because CDP CPU
// throttling makes the layout-shift reading depend on how loaded the machine is: another worker
// burning the same CPUs failed it once and it passed alone. So it is registered in PERF_BUDGETS
// (playwright.config.js) and runs in the `perf` project, always with --workers=1.

const HYDRATED = 'astro-island:not([ssr]) [data-empty-state]';

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

// Before the island's markup lays out, <main> is a few px tall; the hero must not move when it arrives.
for (const route of ['/merge/', '/compress-image/', '/sign/', '/redact/']) {
  test(`${route} shifts nothing under 6x CPU throttling`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await open(page, route);
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => window.__cls), 'layout shift').toBeLessThan(0.001);
  });
}
