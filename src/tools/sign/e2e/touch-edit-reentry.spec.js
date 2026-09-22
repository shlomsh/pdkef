import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MOBI-21: on a phone there is a way back into a text box.
 *
 * The shipped bug: once a text box's edit session closed (tapping the page
 * background is how iOS dismisses the keyboard, and that is wired to
 * PdfWorkspace's `deactivateAll`), nothing a finger could do reopened it. The
 * only route into `onBeginEdit` was TextNode's `onDblClick`, and it is
 * mechanically unreachable on touch: `useDraggableElement` `preventDefault()`s
 * the `touchstart` to own the drag, which suppresses the synthesised mouse
 * sequence, so no `click` fires and therefore no `dblclick` ever can. Outside
 * a session the textarea is inert (`pointer-events: none`), so the hook's
 * INPUT/TEXTAREA early return never applies either. On a mouse the same
 * handler runs on `mousedown`, where `preventDefault()` does not suppress
 * `click` - which is why this was touch-only, and why no unit test caught it:
 * jsdom has neither `pointer-events` nor touch-to-mouse synthesis.
 *
 * So every assertion here needs a real browser driven by real touch input.
 * `page.touchscreen.tap()` and the CDP touch drag below dispatch actual touch
 * events, which is the whole point - a Playwright `.click()` would take the
 * mouse path and prove nothing about the gesture that was broken.
 *
 * Element counts are asserted explicitly throughout, because the user-visible
 * half of this bug was stray empty boxes stacking up on the page and going
 * into the exported PDF.
 *
 * The fixture is the health declaration page 1 geometry, whose page 1 carries
 * detected free-text cells; the setup is form-field-nav-phone.spec.js's.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'editor', 'adapters', 'pdf', '__fixtures__',
  'health-declaration-page1-geometry.pdf',
);

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const elements = (page) => page.locator('[data-editor-element]');
/** The one textarea a caret can actually be in: outside a session it is `readOnly`. */
const openSession = (page) => page.locator('[data-editor-text-input]:not([readonly])');

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
  return page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Text', exact: true });
}

/** Arms the one-shot Text tool and waits for its field hints to be on screen. */
async function armText(page, textTool) {
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
  await expect(page.locator('[class*="field-hint-cell"]').first()).toBeVisible();
}

/**
 * Taps the centre of whatever `locator` currently is, measuring immediately
 * before the tap: arming a tool adds the tool-status row, which moves the
 * document under the finger by ~54px. A rect read before that is a tap
 * somewhere else entirely.
 */
async function tapCentre(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const rect = await locator.boundingBox();
  await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return rect;
}

/**
 * Places a text box on the nth detected free-text cell and types into it.
 * `expectedCount` is asserted rather than assumed, so a placement that
 * silently landed on something else fails here instead of further down.
 */
async function fillNthCell(page, textTool, index, text, expectedCount = 1) {
  await armText(page, textTool);
  await tapCentre(page, page.locator('[class*="field-hint-cell"]').nth(index));
  await expect(elements(page)).toHaveCount(expectedCount);
  await expect(openSession(page)).toHaveCount(1);
  await page.keyboard.type(text);
  // Returned as an id-pinned locator, never `.last()`: a Playwright locator
  // is lazy, so a `.last()` handed back here would silently re-resolve to
  // whatever box is placed next.
  const id = await page.locator('[data-editor-element]').last().getAttribute('data-editor-element-id');
  return { id, box: page.locator(`[data-editor-element-id="${id}"]`) };
}

/** Tapping the page card's own background: how a phone dismisses the keyboard. */
async function closeSession(page) {
  const container = await page.locator('[class*="pages-container"]').boundingBox();
  await page.touchscreen.tap(container.x + 4, container.y + 4);
  await expect(openSession(page)).toHaveCount(0);
  await expect(page.locator('[data-editor-element][data-editor-active]')).toHaveCount(0);
}

/**
 * A real touch drag. Playwright's touchscreen only taps, so this goes through
 * CDP - the same input pipeline, with the move events the gesture controller
 * listens for. A `page.mouse` drag would exercise the mouse path instead, and
 * the tap/drag distinction under test only exists for touch.
 */
async function touchDrag(page, from, to) {
  const cdp = await page.context().newCDPSession(page);
  const point = (p) => [{ x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
  for (let step = 1; step <= 5; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point({
        x: from.x + ((to.x - from.x) * step) / 5,
        y: from.y + ((to.y - from.y) * step) / 5,
      }),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('getting back into a text box on touch', () => {
  test('one tap reopens a closed session on the same box, and adds no element', async ({ page }) => {
    const textTool = await openWithFixture(page);
    const { id, box } = await fillNthCell(page, textTool, 0, 'Shlomi');
    await expect(elements(page)).toHaveCount(1);

    await closeSession(page);
    await expect(elements(page)).toHaveCount(1);

    // The whole ticket, in one gesture.
    await tapCentre(page, box);
    await expect(openSession(page)).toHaveCount(1);

    // And it is *this* box's session, not a session on something new: the
    // caret is in the same element, and what is typed next lands there.
    await expect(page.locator(`[data-editor-element-id="${id}"] [data-editor-text-input]:not([readonly])`))
      .toHaveCount(1);
    await page.keyboard.type(' Levi');
    await expect(page.locator(`[data-editor-element-id="${id}"] [data-editor-text-input]`))
      .toHaveValue('Shlomi Levi');

    // The half of this bug that reached the exported file: taps on an
    // existing box must never stack empty boxes behind it.
    await expect(elements(page)).toHaveCount(1);
  });

  // The element bar floats 8px above the box, and on a coarse pointer every
  // one of its buttons carries a 44px hit area that overhangs the button by
  // 8px. The dangerous state is a box that is selected but NOT being edited -
  // which is where the full bar shows, Duplicate included, and which a phone
  // still reaches after dragging a box. On this form's 5.8px cells a tap aimed
  // at the text hit the bar instead. Which button depends on where the bar
  // sits: measured both ways - Duplicate, cloning the element into the export
  // on every tap (1 -> 2 -> 3 -> 4, no tool armed), and Delete, destroying what
  // had just been typed (1 -> 0, the red this guard was proven with).
  test('after a drag, a tap on a short box opens it and never lands on the bar above it', async ({ page }) => {
    const textTool = await openWithFixture(page);
    const { id, box } = await fillNthCell(page, textTool, 0, 'Shlomi');
    await closeSession(page);
    const start = await box.boundingBox();
    expect(start.height, 'only meaningful on a box shorter than the bar overhang').toBeLessThan(16);
    await touchDrag(
      page,
      { x: start.x + start.width / 2, y: start.y + start.height / 2 },
      { x: start.x + start.width / 2 + 40, y: start.y + start.height / 2 + 30 },
    );
    // Selected, not editing: the full bar, with Duplicate, is up.
    await expect(openSession(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Duplicate element' })).toBeVisible();

    await tapCentre(page, box);

    await expect(elements(page), 'the tap neither duplicated nor deleted the element').toHaveCount(1);
    await expect(page.locator(`[data-editor-element-id="${id}"] [data-editor-text-input]:not([readonly])`),
      'the tap opened this box for typing').toHaveCount(1);
  });

  test('one tap opens a different, unselected box for typing', async ({ page }) => {
    const textTool = await openWithFixture(page);
    const { id: firstId, box: first } = await fillNthCell(page, textTool, 0, 'Shlomi');
    // The open session's own bar hangs over the field next to it, so the
    // first box is put away before the second is placed - which is also the
    // order a person fills a form in.
    await closeSession(page);
    const { id: secondId } = await fillNthCell(page, textTool, 2, 'Levi', 2);
    expect(secondId).not.toBe(firstId);

    await closeSession(page);

    // `first` is neither selected nor being edited at this point, so this is
    // the cold case: one tap, and it is the box being typed into.
    await tapCentre(page, first);
    await expect(page.locator(`[data-editor-element-id="${firstId}"] [data-editor-text-input]:not([readonly])`))
      .toHaveCount(1);
    await page.keyboard.type('!');
    await expect(page.locator(`[data-editor-element-id="${firstId}"] [data-editor-text-input]`))
      .toHaveValue('Shlomi!');
    // The other box is untouched, and nothing new appeared.
    await expect(page.locator(`[data-editor-element-id="${secondId}"] [data-editor-text-input]`))
      .toHaveValue('Levi');
    await expect(elements(page)).toHaveCount(2);
  });

  test('a drag moves the box and does not open a session', async ({ page }) => {
    const textTool = await openWithFixture(page);
    const { box } = await fillNthCell(page, textTool, 0, 'Shlomi');
    await closeSession(page);

    const before = await box.boundingBox();
    await touchDrag(
      page,
      { x: before.x + before.width / 2, y: before.y + before.height / 2 },
      { x: before.x + before.width / 2 + 60, y: before.y + before.height / 2 + 40 },
    );

    // Moved, by roughly what the finger travelled (the commit clamps to the
    // page, which this drag stays well inside).
    const after = await box.boundingBox();
    expect(after.x - before.x).toBeGreaterThan(40);
    expect(after.y - before.y).toBeGreaterThan(20);

    // And still no caret: a drag is not a tap.
    await expect(openSession(page)).toHaveCount(0);
    await expect(elements(page)).toHaveCount(1);
  });
});
