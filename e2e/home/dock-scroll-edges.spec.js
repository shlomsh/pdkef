import { test, expect } from '@playwright/test';

// The dock's two edge strips exist to say "the row keeps going", so each one
// must be painted only while that end of the row actually has more to reach.
// Both halves of that rule have already been broken once:
//
//  - The strips were written with `animation: linear both` followed by the
//    `animation-timeline` longhand. Lightning CSS merges the two into
//    `animation: none`, dropping the timeline and the fill mode, so the built
//    CSS carried no animation at all and both strips sat at their default
//    opacity forever - dimming the first card at scroll 0 and the last one at
//    the end. The dev server does not minify, so it looked correct there.
//  - A scroll timeline whose scroller does not overflow is inactive, and an
//    inactive timeline leaves the element's own opacity standing. At a width
//    that fits all ten tools the dock does not scroll, yet both strips were
//    painted over the first and last card.
//
// Asserting on the running animations rather than a screenshot catches both:
// the first failure removes them entirely, the second leaves them unresolved.
// getComputedStyle does not report a scroll-driven animation's effect on a
// pseudo-element, which is why this reads getAnimations() instead.
test.use({ serviceWorkers: 'block' });

async function dockEdges(page) {
  return page.evaluate(() => {
    const dock = document.querySelector('.home-dock');
    const byName = Object.fromEntries(
      document
        .getAnimations()
        .filter(animation => String(animation.animationName).startsWith('home-dock-edge-'))
        .map(animation => [
          animation.animationName,
          {
            scrollDriven: animation.timeline?.constructor?.name === 'ScrollTimeline',
            // null whenever the timeline is inactive, which is exactly the
            // non-overflowing case the second bug above shipped.
            progress: animation.effect.getComputedTiming().progress,
          },
        ]),
    );
    return {
      scrollLeft: Math.round(dock.scrollLeft),
      maxScroll: Math.round(dock.scrollWidth - dock.clientWidth),
      leading: byName['home-dock-edge-in'] ?? null,
      trailing: byName['home-dock-edge-out'] ?? null,
    };
  });
}

test('the dock fades an edge only while that end of the row has more to reach', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.home-dock')).toBeVisible();

  const atStart = await dockEdges(page);
  expect(
    atStart.maxScroll,
    'the dock is expected to overflow at 390px, so this viewport no longer exercises the scrolling case',
  ).toBeGreaterThan(0);

  // Both strips must be driven by the dock's own scroll, not left static by a
  // minifier that dropped animation-timeline.
  expect(atStart.leading?.scrollDriven, 'the leading strip has no scroll-driven animation').toBe(true);
  expect(atStart.trailing?.scrollDriven, 'the trailing strip has no scroll-driven animation').toBe(true);

  // At rest: nothing hidden to the left, so no leading strip; more to the
  // right, so the trailing strip is at full strength.
  expect(atStart.leading.progress, 'the leading strip is painted over the first card at scroll 0').toBe(0);
  expect(atStart.trailing.progress, 'the trailing strip is faded out while the row still continues').toBe(0);

  await page.evaluate(() => {
    const dock = document.querySelector('.home-dock');
    dock.scrollLeft = dock.scrollWidth;
  });
  await expect.poll(async () => (await dockEdges(page)).trailing.progress).toBe(1);

  const atEnd = await dockEdges(page);
  expect(atEnd.leading.progress, 'the leading strip is missing once the row has been scrolled').toBe(1);
  expect(atEnd.trailing.progress, 'the trailing strip still dims the last card at the end of the row').toBe(1);
});

test('a dock wide enough for every tool fades neither edge', async ({ page }) => {
  // Wide enough to fit all ten cards, still inside the 960px ceiling the strip
  // rules are scoped to - the gap the non-overflowing case lives in.
  await page.setViewportSize({ width: 900, height: 844 });
  await page.goto('/');
  await expect(page.locator('.home-dock')).toBeVisible();

  const edges = await dockEdges(page);
  expect(
    edges.maxScroll,
    'the dock still overflows at 900px, so this viewport no longer exercises the non-overflowing case',
  ).toBe(0);

  // An inactive timeline reports null progress, so the strips must be invisible
  // by their own declared opacity rather than by the animation.
  const painted = await page.evaluate(() => {
    const dock = document.querySelector('.home-dock');
    return ['::before', '::after'].map(part => getComputedStyle(dock, part).opacity);
  });
  expect(painted, 'the dock dims a card although the row does not scroll').toEqual(['0', '0']);
});
