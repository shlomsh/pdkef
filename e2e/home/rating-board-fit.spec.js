import { test, expect } from '@playwright/test';

// A build reads the pinned notes from the store only when it has the token, so CI builds a board with the
// stars alone while production builds one with nine papers, a third taller. The home card must fit the laptop
// band either way, so this gives the board the nine papers of a full one: the island's props are rewritten in
// the page's HTML, the same data the build would have baked in.

const WORDS = 'A note a person agreed to show, long enough to fold on the paper once the words run past the lines it has. '.repeat(3);
const TOOLS = ['merge', 'sign', 'redact', 'compress'];
const notes = Array.from({ length: 9 }, (_, i) => [0, {
  tool: [0, TOOLS[i % TOOLS.length]],
  stars: [0, 5 - (i % 2)],
  ...(i % 3 === 0 ? { comment: [0, WORDS], place: [0, 'Nakuru, Kenya'] } : { country: [0, 'KE'] }),
  day: [0, '2026-11-0' + (1 + (i % 9))],
}]);

async function withNineNotes(page) {
  await page.route('**/', async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      /(<astro-island[^>]*PinnedNotes[^>]*props=")([^"]*)(")/,
      (_, a, props, z) => {
        const parsed = JSON.parse(props.replaceAll('&quot;', '"'));
        parsed.notes = [1, notes];
        return a + JSON.stringify(parsed).replaceAll('"', '&quot;') + z;
      },
    );
    await route.fulfill({ response: res, body: html });
  });
}

test('the rating board card, with nine notes, fits the laptop band like its neighbours', async ({ page }) => {
  await withNineNotes(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  const card = page.locator('.card-stack .board.card-reveal');
  await expect(card.locator('ul > li')).toHaveCount(9);
  await card.evaluate((el) => {
    const nav = document.querySelector('[data-home-bar]').getBoundingClientRect().height;
    window.scrollTo(0, el.getBoundingClientRect().top + scrollY - nav - 16);
  });
  await expect(card).not.toHaveAttribute('data-stack-overflow', '');
  const gaps = await card.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top - document.querySelector('[data-home-bar]').getBoundingClientRect().bottom,
      bottom: document.querySelector('.card-stack footer').getBoundingClientRect().top - r.bottom,
    };
  });
  expect(gaps.top).toBeGreaterThanOrEqual(15);
  expect(gaps.bottom).toBeGreaterThanOrEqual(15);
});
