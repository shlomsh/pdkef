import { test, expect } from '@playwright/test';

/*
 * The landing path's own layout stability, which nothing else measured.
 *
 * Every other CLS assertion in this suite (tool-layout.spec.js, the three
 * saved-work-restore acceptance specs) covers a tool page reconstructing
 * saved work. None of them watches the one page most visitors actually
 * arrive on, and none watches the returning visitor whose recents land
 * after hydration - which is the only path on `/` that shifts at all.
 *
 * That gap is why two CLS moves on `/` reached production and were noticed
 * on the Vercel Speed Insights dashboard days later rather than in CI:
 * QUAL-10's tool-page regression (Sep 13-14) and the dock's entry into the
 * launcher's shift (QUAL-17, below).
 *
 * The shift being measured, identical on every build since the grid was
 * built: `FileDropzone` is `client:load` and renders `recents` as `null` on
 * the server (see .claude/rules/home-page.md - that is what keeps browser
 * storage out of the render body), so a returning visitor's tiles arrive in
 * the mount effect. Six of them turn the three-column `.launcher` grid from
 * one row into three, which moves the picker tile down. That much is the
 * accepted residual the home-page rule documents and deliberately declined
 * to fix, because reserving two-row height for every visitor would tax the
 * first-time visitor to smooth a transition only a returning one sees.
 *
 * What this pins is the blast radius, not the residual: the shift may move
 * the launcher's own contents and nothing else.
 */

const RECENT_TOOLS = ['sign', 'redact', 'merge', 'compress', 'split', 'edit-pdf'];

/** Seed the recents index the way e2e/home/recent-files.spec.js does: the
 *  synchronous localStorage index alone, which is what `FileDropzone` reads
 *  on mount and all this measurement needs. The IndexedDB entries behind it
 *  hold the bytes and the thumbnails; without them the tiles render at their
 *  no-preview height, so the grid growth measured here is the floor of what a
 *  real returning visitor sees, never an overstatement. */
async function seedRecents(page, count) {
  await page.addInitScript(([n, tools]) => {
    const now = Date.now();
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify(
      Array.from({ length: n }, (_, i) => ({
        id: `sha256:landing-cls-${i}`,
        tool: tools[i % tools.length],
        fileName: `Scanned document ${i + 1}.pdf`,
        savedAt: now - i * 1000,
      })),
    ));
  }, [count, RECENT_TOOLS]);
}

/** Classify every layout shift by whether the launcher owns all of it.
 *  Same shape as tool-layout.spec.js's hero/non-hero split, and the same
 *  rule for an ambiguous entry: a shift with no sources, or with any source
 *  outside `.launcher`, cannot be proven to be the launcher's own reflow, so
 *  it counts against the strict budget. */
async function observeShifts(page) {
  await page.addInitScript(() => {
    window.__launcherCls = 0;
    window.__outsideCls = 0;
    window.__outsideSources = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        const sources = entry.sources ?? [];
        const inLauncher = (node) => {
          const el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
          return Boolean(el?.closest?.('#home-files'));
        };
        if (sources.length > 0 && sources.every((source) => inLauncher(source.node))) {
          window.__launcherCls += entry.value;
        } else {
          window.__outsideCls += entry.value;
          for (const source of sources) {
            const el = source.node?.nodeType === Node.TEXT_NODE
              ? source.node.parentElement : source.node;
            if (el && !inLauncher(el)) {
              window.__outsideSources.push(
                `${el.nodeName}${el.className && typeof el.className === 'string'
                  ? '.' + el.className.trim().split(/\s+/)[0] : ''}`,
              );
            }
          }
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/** Hydration is what moves the launcher, so the window has to outlast it.
 *  The shift lands at roughly 5.3s on a 4x-throttled phone profile and well
 *  under 1s here; 8s of wall clock after `load` covers both without making
 *  the spec wait on a fixed budget it is not measuring. */
async function settle(page) {
  await page.waitForFunction(
    () => document.querySelectorAll('#home-files li').length > 0,
    null,
    { timeout: 20_000 },
  );
  // Then hold a fixed wall-clock window open, rather than reading as soon as
  // the tiles exist. The tiles appearing in the DOM is not the shift: the
  // shift is recorded when the browser paints the grown layout, which lags
  // it. An earlier revision of this spec read 1.5s after the tiles and
  // raced that paint - it reported 0.00000 and 0.00906 on a build the same
  // measurement reports 0.01444 and 0.00906 on, because the window closed
  // at 2.80s on an entry timestamped 2.82s. 8s from navigation start clears
  // the latest entry seen on this page (5.35s, portrait, throttled).
  await page.waitForFunction(() => performance.now() > 8_000, null, { timeout: 20_000 });
  return page.evaluate(() => ({
    launcherCls: window.__launcherCls,
    outsideCls: window.__outsideCls,
    outsideSources: [...new Set(window.__outsideSources)],
  }));
}

for (const { name, width, height } of [
  { name: 'phone portrait', width: 393, height: 851 },
  { name: 'phone landscape', width: 851, height: 393 },
]) {
  // A real phone context, not a desktop window resized to phone dimensions:
  // `isMobile` changes how the viewport meta is honoured, and the two
  // disagree about this page. Measured both ways, the dock's movement shows
  // at 851x393 under either, but at 393x851 only under mobile emulation - a
  // resized desktop window called the portrait case clean. Spelled out
  // rather than spread from `devices['Pixel 5']`, because that object also
  // carries `defaultBrowserType`, which Playwright refuses inside a describe
  // ("it forces a new worker").
  test.describe(name, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });

  test(`recents arriving move the launcher, and the dock moves no further (${name})`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling needs a CDP session; only the chromium project has one.');

    // The throttling is load-bearing, not decoration. Unthrottled, hydration
    // finishes fast enough that the launcher's growth lands in the same frame
    // batch as the first layout, so the dock never registers as having moved
    // between two rendered frames and this spec passes on a build that is
    // visibly shifting on a real phone - checked against the regressed build
    // before this rate was added. 4x is the multiplier Lighthouse's mobile
    // preset uses and the one compress/compare-preview.spec.js already sets.
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // The network half matters as much as the CPU half, and for the same
    // reason. Measured on the built output: at full LAN speed the portrait
    // case reports 0.0000 because hydration finishes before the first screen
    // has settled into frames the shift could be measured against, while the
    // same build on a throttled connection reports 0.0144. Only the landscape
    // case survives without this, so a CPU-only guard would have watched half
    // the regression. These are the numbers used throughout QUAL-17.
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });

    await seedRecents(page, 6);
    await observeShifts(page);
    await page.goto('/');

    const { launcherCls, outsideCls, outsideSources } = await settle(page);

    // What this pins, given QUAL-17 is holding the CSS decision until the
    // Speed Insights data is segmented by route and device.
    //
    // 1. Blast radius. `ef8aa76` changed `.home-hero` from a fixed
    //    `height: calc(100svh + 1216svh)` to `min-height` with `min-content`
    //    header and dock rows, so a landscape phone would stop crushing the
    //    dock from 111px to 34px. The fixed height had been containing the
    //    launcher's post-hydration growth; without it that growth pushes
    //    `.home-dock`. `NAV.home-dock` is therefore the one known passenger
    //    and is named here rather than tolerated by a number: anything else
    //    turning up outside the launcher is a new defect, whatever it
    //    weighs, and the assertion prints what moved because the source list
    //    is the whole diagnosis.
    const unexpected = outsideSources.filter((source) => !source.includes('home-dock'));
    expect(unexpected, `new elements moved outside the launcher: ${unexpected.join(', ')}`)
      .toEqual([]);

    // 2. Magnitude. Measured on the built output through `astro preview`:
    //    0.00906 at 851x393 (the dock), 0.00000 at 393x851. 0.03 leaves room
    //    for the grid to be worked on without a re-tune every time, still
    //    catches a doubling, and sits three times under the 0.1 that starts
    //    "needs improvement". The home-page rule's accepted residual is the
    //    same order (0.0211 on the 2026-08 grid).
    expect(launcherCls + outsideCls).toBeLessThanOrEqual(0.03);
  });
  });
}

test('a first visit does not shift at all', async ({ page }) => {
  // No recents means nothing arrives after mount, so the first screen has
  // no reason to move: 0.0000 measured on every build and both orientations.
  // This is the half that stays true no matter what the grid does, and the
  // one a first-time search visitor actually gets.
  await page.setViewportSize({ width: 393, height: 851 });
  await observeShifts(page);
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('#home-files'));
  await page.waitForTimeout(2_000);

  const { launcherCls, outsideCls, outsideSources } = await page.evaluate(() => ({
    launcherCls: window.__launcherCls,
    outsideCls: window.__outsideCls,
    outsideSources: [...new Set(window.__outsideSources)],
  }));

  expect(outsideCls, `moved: ${outsideSources.join(', ') || 'none'}`).toBe(0);
  expect(launcherCls).toBe(0);
});
