import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MOBI-22: a field move is ONE scroll, and it lands the field where the
 * keyboard leaves room.
 *
 * Reported on an iPhone: Previous/Next "scrolled all the way up to the toolbar
 * and then all the way down to the next element ... very blurry and
 * confusing". Two moves where there should be one, and the second one was the
 * browser's, not ours - `bringFieldIntoView` (useFieldNavigation.ts) used to
 * run in the same tick as the dispatch that creates the box, so it found no
 * node and scrolled nothing, and it mixed an absolute `scrollIntoView` with a
 * relative nudge computed from a rect read before that async smooth scroll had
 * moved anything. It now defers two animation frames and makes a single
 * relative `scrollBy` centred on the VISUAL viewport.
 *
 * Only a browser can answer either half of that. jsdom has no scrolling, no
 * `visualViewport`, no smooth-scroll animation and no layout, so it cannot say
 * how many times the page moved or where the field ended up; the unit tests
 * next door prove the dispatch sequence and stop there.
 *
 * The visual viewport is faked to 400px of a 844px layout viewport, the way an
 * open keyboard shrinks it on iOS (the layout viewport does not shrink, which
 * is the whole reason the second step exists). Headless Chromium has no soft
 * keyboard, so this is the only way to exercise the branch at all.
 *
 * ## The harness's own scroll, and why the press is dispatched the way it is
 *
 * A Playwright `locator.click()` first scrolls its target into view, and that
 * scroll is INSTANT, not smooth. Measured 2026-09-22 with `window.scrollTo`,
 * `window.scrollBy`, `Element.prototype.scrollIntoView` and
 * `HTMLElement.prototype.focus` monkey-patched in the page to log a stack
 * trace per call: from a page scrolled to y=1400 with the Next button off
 * screen, `locator.scrollIntoViewIfNeeded()` ALONE - no click, and zero app
 * scroll calls logged - moved the page 1400 -> 221 in a single frame. That
 * instant jump, followed by the app's own smooth glide, is exactly the
 * "1400 -> 176 in one frame, then a glide to 441" that MOBI-22 was still
 * chasing as a product bug. It is the test driver, not the product: the same
 * press from the same position dispatched as a DOM `click()` is one smooth
 * monotonic `scrollBy(-928.5)` and nothing else.
 *
 * So: the first test presses the button through Playwright, having first
 * asserted the button is comfortably on screen so no actionability scroll can
 * fire - which is also the real case, since the control hangs off the element
 * the person is looking at (MOBI-16). The second test, which is the long move
 * the report describes, starts deliberately scrolled away and therefore has to
 * dispatch the press in-page, or the driver would scroll the page itself and
 * the measurement would be of Playwright.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'editor', 'adapters', 'pdf', '__fixtures__',
  'health-declaration-page1-geometry.pdf',
);

/** The visual viewport an open keyboard leaves on a 844px-tall phone. */
const KEYBOARD_BAND_PX = 400;

/** Sampling interval for the scroll trace, in ms. */
const SAMPLE_MS = 25;

/**
 * Sub-pixel slack between summed travel and net displacement. A monotonic
 * scroll sampled at any rate sums to exactly its net displacement; this covers
 * the fractional device pixels a smooth scroll lands on, nothing more. The
 * defect this guards against was 1489px of travel for 959px of displacement.
 */
const TRAVEL_SLACK_PX = 2;

/**
 * How far off centre the arrival may sit. The move is smooth, so the sampler
 * stops when the page has been still for a while rather than at a fixed time,
 * and the last few pixels of an ease-out are what this absorbs.
 */
const CENTRE_SLACK_PX = 24;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Same setup as form-field-nav-phone.spec.js: /sign, the health-declaration
 * page-1 geometry fixture, Text armed, field hints showing. */
async function openWithFixture(page) {
  await page.goto('/sign');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'health-declaration.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(FIXTURE),
  });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
  const textTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Text', exact: true });
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
  await expect(page.locator('[class*="field-hint-cell"]').first()).toBeVisible();
}

/** Opens a box and a typing session on the first detected cell - the state a
 * person presses Next from. */
async function tapFirstCellHint(page) {
  const hint = page.locator('[class*="field-hint-cell"]').first();
  const box = await hint.boundingBox();
  await hint.click({ position: { x: box.width / 2, y: box.height / 2 }, force: true });
  await expect(page.locator('[data-editor-element][data-editor-active]')).toHaveCount(1);
}

const activeElement = (page) => page.locator('[data-editor-element][data-editor-active]');
const elementBar = (page) => activeElement(page).locator('[data-editor-actions]');

/**
 * Shrinks `visualViewport` to what a keyboard leaves. `height` is an accessor
 * on the live object, so it is redefined rather than assigned; `offsetTop`
 * stays whatever the browser reports, since `bringFieldIntoView` reads both.
 */
async function fakeKeyboard(page, height) {
  await page.evaluate((band) => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => band });
  }, height);
}

/**
 * Runs `press` while sampling the document scroll offset every SAMPLE_MS, and
 * returns the trace plus where the newly active element landed.
 *
 * `max(window.scrollY, document.scrollingElement.scrollTop)` rather than
 * either alone: the document is what scrolls here (measured - no ancestor
 * scroll container is involved), and taking both means a future layout that
 * moved the scrolling to a container would show up as a broken trace rather
 * than as a silently flat one.
 */
async function traceScroll(page, press, settleMs = 1200) {
  await page.evaluate((interval) => {
    window.__scrollSamples = [];
    const sample = () => window.__scrollSamples.push(
      Math.max(window.scrollY, document.scrollingElement.scrollTop),
    );
    sample();
    window.__scrollSampler = setInterval(sample, interval);
  }, SAMPLE_MS);

  await press();
  await page.waitForTimeout(settleMs);

  return page.evaluate((band) => {
    clearInterval(window.__scrollSampler);
    const samples = window.__scrollSamples;
    let travel = 0;
    for (let i = 1; i < samples.length; i += 1) travel += Math.abs(samples[i] - samples[i - 1]);
    const element = document.querySelector('[data-editor-element][data-editor-active]');
    const rect = element.getBoundingClientRect();
    return {
      samples,
      travel,
      net: Math.abs(samples[samples.length - 1] - samples[0]),
      start: samples[0],
      end: samples[samples.length - 1],
      arrival: { top: rect.top, bottom: rect.bottom, height: rect.height },
      band: { top: window.visualViewport.offsetTop, height: band },
    };
  }, KEYBOARD_BAND_PX);
}

/** The assertions both moves share: one scroll, and a landing the keyboard
 * does not cover. */
function expectOneMoveIntoTheBand(trace) {
  expect(
    trace.travel,
    `travel ${trace.travel} vs net ${trace.net}; samples ${trace.samples.join(' ')}`,
  ).toBeLessThanOrEqual(trace.net + TRAVEL_SLACK_PX);

  // Non-vacuity: a move that did not move proves nothing about how it moved.
  expect(trace.net, 'net displacement').toBeGreaterThan(100);

  // In the band the keyboard leaves, whole, and centred in it - not behind the
  // keyboard, which is where `block: 'center'` on the layout viewport put it
  // (measured at rect.top = 461 in a band ending at 400).
  const bandTop = trace.band.top;
  const bandBottom = trace.band.top + trace.band.height;
  expect(trace.arrival.top, 'arrival top inside the band').toBeGreaterThanOrEqual(bandTop);
  expect(trace.arrival.bottom, 'arrival bottom inside the band').toBeLessThanOrEqual(bandBottom);
  const centred = bandTop + (trace.band.height - trace.arrival.height) / 2;
  expect(Math.abs(trace.arrival.top - centred), 'distance from the band centre')
    .toBeLessThanOrEqual(CENTRE_SLACK_PX);
}

test.describe('a field move scrolls once', () => {
  test('Next is one monotonic scroll that lands the field in the visible band', async ({ page }) => {
    await openWithFixture(page);
    await tapFirstCellHint(page);
    await activeElement(page).locator('[data-editor-text-input]').fill('Shlomi');
    await fakeKeyboard(page, KEYBOARD_BAND_PX);

    const next = elementBar(page).getByRole('button', { name: 'Next field' });
    await expect(next).toBeEnabled();

    // The press must not itself scroll, or the trace is of Playwright (see the
    // module doc). Fully on screen with room to spare means the driver's
    // actionability scroll is a no-op.
    const button = await next.boundingBox();
    const viewport = page.viewportSize();
    expect(button.y, 'Next button top on screen').toBeGreaterThan(8);
    expect(button.y + button.height, 'Next button bottom on screen')
      .toBeLessThan(viewport.height - 8);

    const trace = await traceScroll(page, () => next.click());
    expectOneMoveIntoTheBand(trace);
  });

  test('the long move the report describes is one glide, not up and then down', async ({ page }) => {
    await openWithFixture(page);
    await tapFirstCellHint(page);
    await activeElement(page).locator('[data-editor-text-input]').fill('Shlomi');
    await fakeKeyboard(page, KEYBOARD_BAND_PX);

    // Far enough away that the destination is nowhere near the screen - the
    // distance at which the reported "all the way up and then all the way
    // down" was visible at all.
    await page.evaluate(() => { window.scrollTo(0, 1400); });
    await page.waitForTimeout(200);

    const trace = await traceScroll(page, () => page.evaluate(() => {
      document.querySelector(
        '[data-editor-element][data-editor-active] [data-editor-actions] button[aria-label="Next field"]',
      ).click();
    }));

    expect(trace.net, 'the move is a long one').toBeGreaterThan(500);
    expectOneMoveIntoTheBand(trace);

    // And it only ever goes one way. Stated separately from the travel sum
    // because a sum can be met by a pair of errors that cancel, while the
    // symptom in the report is literally a reversal.
    const deltas = trace.samples
      .slice(1)
      .map((y, i) => y - trace.samples[i])
      .filter((d) => Math.abs(d) > 1);
    const forwards = deltas.filter((d) => d > 0).length;
    const backwards = deltas.filter((d) => d < 0).length;
    expect(
      Math.min(forwards, backwards),
      `reversals in ${trace.samples.join(' ')}`,
    ).toBe(0);
  });
});
