import { test, expect } from '@playwright/test';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { writeFakeCamera } from './fakeCamera.js';

// MEM-51 - what jsdom cannot prove: a tab with no worker in control (a first visit, before the worker is
// active) was loaded from one build, a later build is deployed, and Start scanning lazily imports scan-late.js
// from that later build. Its shared chunks (tools-common.js and the rest) are the ones the page already
// evaluated, so before the guard every imported name bound to a different function, silently. The guard makes
// the chunk fail while it evaluates and chunkReload (MEM-38) reloads the page once onto the current build.
//
// One build exists here, so the later build is made by serving the real scan-late.js with the interface hash
// it expects of one shared chunk changed (what a deploy that changes that chunk's exports does to it). The
// bundler half, a late chunk beside another build's shared chunk failing to evaluate, is proven in
// scripts/chunkInterfaceGuard.test.mjs.
const camera = writeFakeCamera();
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  permissions: ['camera'],
  serviceWorkers: 'block',
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${camera}`],
  },
});

test('a lazy chunk from a later build beside the older shared chunks reloads the page onto one build', async ({ page }) => {
  let servedLater = 0;
  await page.route('**/shared/scan-late.js', async (route) => {
    const response = await route.fetch();
    const real = await response.text();
    if (servedLater++ > 0) return route.fulfill({ response, body: real });
    // The first request only: the later build's chunk, expecting another interface from the first shared chunk it guards.
    const later = real.replace(/!=="[0-9a-f]{6}"/, '!=="decafe"');
    expect(later).not.toBe(real);
    return route.fulfill({ response, body: later });
  });

  const reloads = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) reloads.push(frame.url()); });

  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  expect(reloads).toHaveLength(1);

  await page.getByText('Start scanning').click();

  // chunkReload waits a moment to be sure the page is not leaving, then reloads once; the second request gets the real chunk.
  await expect.poll(() => reloads.length, { timeout: 15_000 }).toBe(2);
  await waitForIsland(page);
  await page.getByText('Start scanning').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(reloads).toHaveLength(2);
  expect(servedLater).toBe(2);
});
