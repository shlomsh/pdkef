import { test, expect } from '@playwright/test';

// index.astro's --home-nav-height default (calc(3.5rem + 0.5px)) duplicates
// two values AppBar.astro owns: its h-14 inner row (3.5rem = 56px) and its
// border-b-[0.5px] hairline. That default is only the first-paint value -
// homeWorkspace.ts measures [data-home-bar] at runtime and writes the actual
// rendered height back onto document.body (see the comment on the CSS
// default), so the resolved variable is expected to equal the bar's real
// measured height in every environment, not just approximate the hand-
// derived constant. This guard checks that end state, so it fails equally
// whether the CSS default drifts or the runtime measurement itself breaks.
test.use({ serviceWorkers: 'block' });

async function resolvedNavHeight(page) {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.height = 'var(--home-nav-height)';
    document.body.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
}

test('--home-nav-height matches [data-home-bar]\'s rendered height', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  const bar = page.locator('[data-home-bar]');
  await expect(bar).toBeVisible();

  const barHeight = await bar.evaluate(el => el.getBoundingClientRect().height);
  const resolved = await resolvedNavHeight(page);

  expect(
    resolved,
    `--home-nav-height resolves to ${resolved}px, but [data-home-bar] actually renders at ${barHeight}px - the runtime measurement in homeWorkspace.ts is not keeping the variable in sync`,
  ).toBeCloseTo(barHeight, 1);
});
