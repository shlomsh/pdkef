import { test, expect } from '@playwright/test';

// FeatureCard's settle-into-place reveal, which hides each card until it
// enters the viewport. Every assertion here is browser-only by nature: the
// reveal is a CSS scroll-driven animation, so its whole state lives in
// computed style derived from scroll position, and jsdom has neither.
//
// Two shipped bugs are pinned here, and they fail in opposite directions.
//
// The first was the mechanism. The reveal used to be an IntersectionObserver
// that added a class, and an observer only ever learns about states some
// rendered frame passed through - so a single-step scroll (End, a scrollbar
// drag, scrollIntoView) moved a card from below the viewport to above it
// with no intersecting frame in between, the callback never ran, and the
// card kept its opacity: 0 permanently while still occupying full height.
// On /sign/ that read as a screen-tall blank gap after "Free for everyone".
//
// The second was the range. Rewritten as a scroll-driven animation, the
// range was authored `entry 0% 15vh` - which parses, and silently means
// something else: the length is taken as the range *start*, leaving the end
// at `entry 100%`. The fade then ran over ~750px instead of ~150px, so a
// visitor who stopped scrolling mid-range parked real body copy at 35%
// opacity, well under the contrast floor. Nothing about that looks wrong in
// a screenshot of a settled page, which is why it is measured here.
test.use({ serviceWorkers: 'block' });

const cards = (page) => page.locator('.card-reveal');

const opacities = (page) =>
  page.$$eval('.card-reveal', (els) => els.map((el) => Number(getComputedStyle(el).opacity)));

// Two frames: a scroll-driven animation is recomputed off the new scroll
// offset, so the style read one frame later can still be the old one.
const settle = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test('a single-step scroll past the cards never strands one invisible', async ({ page }) => {
  await page.goto('/sign/');
  await expect(cards(page).first()).toBeAttached();

  // One synchronous jump, with no intermediate frames at all - the case the
  // observer could not see. Deliberately not a stepped scroll: stepping is
  // what made the old bug look fixed.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await settle(page);

  const scrolledPast = await page.$$eval('.card-reveal', (els) =>
    els.map((el, index) => ({ index, opacity: Number(getComputedStyle(el).opacity), bottom: el.getBoundingClientRect().bottom })),
  );
  expect(scrolledPast.length, 'no feature cards on /sign/ - the selector has drifted').toBeGreaterThan(0);

  for (const card of scrolledPast) {
    expect(
      card.opacity,
      `card ${card.index} is above the viewport (bottom ${Math.round(card.bottom)}px) but still at opacity ${card.opacity} - it was skipped and never revealed`,
    ).toBe(1);
  }
});

test('the fade finishes while the card still shows only its own top edge', async ({ page }) => {
  await page.goto('/sign/');

  const geometry = await page.$$eval('.card-reveal', (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { docTop: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
    }),
  );

  for (const [index, card] of geometry.entries()) {
    const viewport = page.viewportSize().height;
    // Scroll so the card's top edge sits this far above the viewport's
    // bottom edge - i.e. this much of the card is on screen.
    const opacityAfter = async (revealed) => {
      await page.evaluate((y) => window.scrollTo(0, y), card.docTop - viewport + revealed);
      await settle(page);
      return (await opacities(page))[index];
    };

    // 200px is the budget, against a ~150px design figure. The mis-parsed
    // range sat at roughly 0.13 here.
    expect(
      await opacityAfter(200),
      `card ${index} (${card.height}px tall) is still fading with 200px of it on screen - the range is far longer than intended, so body copy renders at partial opacity`,
    ).toBe(1);

    // The other half of the same invariant: the fade is a fade, not an
    // instant swap, so it must still be running early on. Without this, a
    // range of zero would pass the assertion above.
    const early = await opacityAfter(20);
    expect(early, `card ${index} is fully opaque 20px in - the reveal is not animating at all`).toBeLessThan(1);
  }
});

test('cards in the home page story stack are never translucent', async ({ page }) => {
  // The stack pins each card and slides the next over it, so a card that
  // fades in while already overlapping the one it covers shows straight
  // through to it. index.astro switches the reveal off inside .card-stack;
  // this is that override, which lives one `animation-name` away from
  // silently coming back.
  await page.goto('/');

  const stacked = page.locator('.card-stack .card-reveal');
  const count = await stacked.count();
  expect(count, 'no stacked cards on the home page - the stack markup has changed').toBeGreaterThan(0);

  const height = page.viewportSize().height;
  for (let y = 0; y < 6000; y += Math.round(height / 2)) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await settle(page);
    const seen = await page.$$eval('.card-stack .card-reveal', (els) =>
      els.map((el) => Number(getComputedStyle(el).opacity)),
    );
    for (const [index, opacity] of seen.entries()) {
      expect(opacity, `stacked card ${index} is at opacity ${opacity} at scrollY ${y} - you can see through it to the card behind`).toBe(1);
    }
  }
});

test('prefers-reduced-motion leaves every card fully visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sign/');
  await expect(cards(page).first()).toBeAttached();

  // Including the cards still far below the fold: under reduced motion there
  // is no animation to reveal them, so the hidden start state must never be
  // applied in the first place.
  for (const [index, opacity] of (await opacities(page)).entries()) {
    expect(opacity, `card ${index} is hidden at opacity ${opacity} under reduced motion, with nothing that will ever reveal it`).toBe(1);
  }
});
