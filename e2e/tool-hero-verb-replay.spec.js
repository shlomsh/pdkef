import { test, expect } from '@playwright/test';

// HERO guard: the verb plays once on load, then replays when a mouse enters the sheet by easing
// back along its own path (a rewind, then the normal play), never by snapping to its start.
// jsdom has no animation clock, so only a browser can prove there is no jump.

const SHEET = '[data-empty-state]';
const PIECES = `${SHEET} i`;
const HYDRATED = `astro-island:not([ssr]) ${SHEET}`;

test.use({ viewport: { width: 1440, height: 820 } });

// Samples every piece's computed `translate` on each animation frame into window.__samples.
const RECORDER = () => {
  window.__samples = [];
  window.__stop = false;
  const tick = () => {
    const row = [...document.querySelectorAll('[data-empty-state] i')].map((el) => {
      const [x = 0, y = 0] = getComputedStyle(el).translate.split(' ').map((v) => parseFloat(v) || 0);
      return [x, y];
    });
    window.__samples.push(row);
    if (!window.__stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const stats = (samples) => {
  let maxStep = 0;
  let moved = 0;
  for (let i = 1; i < samples.length; i++) {
    samples[i].forEach(([x, y], p) => {
      const [px, py] = samples[i - 1][p];
      const step = Math.hypot(x - px, y - py);
      maxStep = Math.max(maxStep, step);
      moved = Math.max(moved, Math.hypot(x - samples[0][p][0], y - samples[0][p][1]));
    });
  }
  return { maxStep, moved };
};

const finalValues = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-empty-state] i')].map((el) => getComputedStyle(el).translate));

const allFinished = (page) =>
  page.waitForFunction(() => {
    const box = document.querySelector('[data-empty-state] i')?.closest('[aria-hidden="true"]');
    const anims = box?.getAnimations({ subtree: true }) ?? [];
    return anims.length > 0 && anims.every((a) => a.playState === 'finished');
  });

test('hovering the sheet rewinds the verb and plays it again without a jump', async ({ page }) => {
  await page.addInitScript(() => {
    // Record the normal forward play from the first frame.
    document.addEventListener('DOMContentLoaded', () => {
      window.__recordLoad?.();
    });
  });
  await page.addInitScript(`window.__recordLoad = ${RECORDER.toString()}`);
  await page.goto('/merge/');
  await expect(page.locator(HYDRATED)).toBeVisible();
  await allFinished(page);
  const load = stats(await page.evaluate(() => (window.__stop = true, window.__samples)));
  const before = await finalValues(page);

  await page.mouse.move(5, 5);
  await page.evaluate(RECORDER);
  const box = await page.locator(SHEET).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  // The rewind has started (an animation is running) before waiting for it to finish.
  await page.waitForFunction(() => {
    const box = document.querySelector('[data-empty-state] i')?.closest('[aria-hidden="true"]');
    return (box?.getAnimations({ subtree: true }) ?? []).some((a) => a.playState === 'running');
  });
  await allFinished(page);
  // Time on purpose: tail sample after the last frame, before the recorder stops.
  await page.waitForTimeout(100);
  const replay = stats(await page.evaluate(() => (window.__stop = true, window.__samples)));

  console.log(`largest step: forward on load ${load.maxStep.toFixed(2)}px, replay ${replay.maxStep.toFixed(2)}px`);
  expect(replay.moved, 'the verb moved on hover').toBeGreaterThan(20);
  // The rewind runs at 2x, so its fastest frame is about 2x the forward play's (3x measured 2.8x,
  // a 44px step as the pieces landed, which read as a snap); a snap back would be a step of the
  // piece's whole travel, several times that.
  expect(replay.maxStep, 'no frame jumps').toBeLessThanOrEqual(load.maxStep * 2.2);
  expect(replay.maxStep, 'no snap to the start').toBeLessThan(replay.moved / 2);
  expect(await finalValues(page)).toEqual(before);
});
