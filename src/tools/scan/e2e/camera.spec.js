import { test, expect } from '@playwright/test';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { writeFakeCamera } from './fakeCamera.js';

// SCAN-08 - what jsdom cannot prove about the camera in the page: with a real (fake) camera stream, Start
// scanning opens the viewfinder, the page in view is taken by itself, the camera then waits for the page to
// turn, and Done lands on the table with that one page. That the same page is never taken twice is the
// capture machine's, proven on frame sequences in captureMachine.test.ts.

const camera = writeFakeCamera();

test.use({
  // A phone: coarse pointer and touch, which is where the live camera is offered.
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${camera}`],
  },
});

test('the camera takes a page by itself and Done lands on the table', async ({ page }) => {
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);

  await page.getByText('Start scanning').click();
  const viewfinder = page.getByRole('dialog');
  await expect(viewfinder).toBeVisible();

  const stack = viewfinder.getByRole('button', { name: /The last page taken, 1 so far/ });
  await expect(stack).toBeVisible({ timeout: 15_000 });
  await expect(viewfinder.getByText('Page 1. Turn the page.')).toBeVisible();

  await viewfinder.getByRole('button', { name: 'Done' }).click();
  await expect(viewfinder).toBeHidden();
  await expect(page.locator('[data-table-page]')).toHaveCount(1);
});
