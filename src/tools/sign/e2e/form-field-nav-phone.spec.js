import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MOBI-16: at a phone viewport, the field Next/Previous pair lives on the
 * selected text element's own floating toolbar, not in the sticky top card,
 * and the bar it lives in is one row while typing rather than two.
 *
 * Every claim here is a rendered-rect claim, which is exactly what jsdom
 * cannot answer. jsdom has no layout, so `.actions` has no height, no wrapped
 * rows and no `getBoundingClientRect()` worth reading; it also never evaluates
 * `@media (pointer: coarse)`, which is what arms both halves of the fix (the
 * 44px `::before` hit box in EditorControls.module.css and the 16px `row-gap`
 * in EditorElement.module.css). The unit tests already prove the JSX branch -
 * `ElementToolbar.test.tsx` covers which controls render compact and which
 * only after the disclosure - so what is left is the geometry: that the bar is
 * a single row, that its chevrons land inside the viewport, that the wrapped
 * rows' 44px hit boxes no longer collide, and that Next still navigates from
 * there.
 *
 * What this cannot reproduce: the original report is an iOS soft keyboard
 * scrolling the *visual* viewport out from under a layout-viewport-pinned
 * sticky card. Headless Chromium has no soft keyboard and no such split. What
 * it can prove instead is the mechanism that makes the drift impossible - the
 * chevrons hang off the element itself (asserted below as a fixed small gap
 * above it) and the top card has no copy left that could drift.
 *
 * The fixture is the health declaration page 1 geometry, the one whose page 1
 * has closed free-text cells rather than comb runs; the setup is
 * form-cell-fill.spec.js's.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'tools', 'sign', 'fields', '__fixtures__',
  'health-declaration-page1-geometry.pdf',
);

// `.element-button::before { inset: -8px }` under `(pointer: coarse)`
// (EditorControls.module.css): the button keeps its 28px look and the pseudo
// takes the hit box out to 28 + 2*8 = 44.
const HIT_INSET_PX = 8;
const HIT_TARGET_PX = 28 + 2 * HIT_INSET_PX;

// Subpixel slack for the anchoring check below. Floating UI positions the bar
// a fixed offset above the element - 16px on a coarse pointer, 8px otherwise
// (DraggableWrapper.tsx, MOBI-21) - and this only has to tell "hanging off the
// element" from "somewhere else on the page".
const ANCHOR_SLACK_PX = 4;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function openWithFixture(page) {
  await page.goto('/sign/?next=0');
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

/**
 * Taps the first detected free-text cell, which is the real phone gesture this
 * whole ticket is about: it opens a text box on that cell and a typing session
 * on the box (useWorkspaceGestures.ts dispatches SET_EDITING_ELEMENT_ID for
 * the text tool), which is the state a person fills a form in.
 *
 * The *first* cell is deliberate rather than incidental: it is first in the
 * navigation order too, so Previous is disabled and Next is not, which is what
 * the navigation test needs. The Text tool is one-shot, so the hints are gone
 * after this - a second tap would need it re-armed.
 */
async function tapFirstCellHint(page) {
  const hint = page.locator('[class*="field-hint-cell"]').first();
  const box = await hint.boundingBox();
  await hint.click({ position: { x: box.width / 2, y: box.height / 2 }, force: true });
  await expect(page.locator('[data-editor-element][data-editor-active]')).toHaveCount(1);
}

const activeElement = (page) => page.locator('[data-editor-element][data-editor-active]');
const elementBar = (page) => activeElement(page).locator('[data-editor-actions]');

/** Every button in the active element's floating bar, with its rendered rect. */
function readButtons(page) {
  return page.evaluate(() => [...document.querySelectorAll(
    '[data-editor-element][data-editor-active] [data-editor-actions] button',
  )].map((button) => {
    const rect = button.getBoundingClientRect();
    return {
      // Several of these controls are labelled by their content ("A-", "B"),
      // so this is a diagnostic label for a failure message, not a selector.
      label: button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim(),
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
    };
  }));
}

/** The bar's own height, the height one row of it would be, and its row gap. */
function readBarRows(page) {
  return page.evaluate(() => {
    const actions = document.querySelector('[data-editor-element][data-editor-active] [data-editor-actions]');
    const style = getComputedStyle(actions);
    // A flex row is as tall as its tallest child plus the bar's own vertical
    // padding, so one row is derived from the children actually rendered
    // rather than from a number written down here. A second row would add that
    // same child height again, plus the coarse-pointer `row-gap`.
    const rowHeight = Math.max(...[...actions.children].map((child) => child.getBoundingClientRect().height));
    return {
      height: actions.getBoundingClientRect().height,
      rowHeight,
      oneRow: rowHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
      rowGap: parseFloat(style.rowGap),
      buttons: actions.querySelectorAll('button').length,
    };
  });
}

test.describe('filling a form field on a phone', () => {
  test('Next and Previous are on the element, not the top card, and on screen', async ({ page }) => {
    await openWithFixture(page);
    await tapFirstCellHint(page);

    const bar = elementBar(page);
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Previous field' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Next field' })).toBeVisible();

    // And not a second copy alongside: the top card's own `fieldNav` is null on
    // a coarse pointer (SignToolbar.tsx), so `[data-tool-shell]` - the identity
    // row and the control row, not the pages under them - carries no field-nav
    // control at all. Matched on the substring, so a relabelled control still
    // fails this rather than slipping past an exact name.
    await expect(page.locator('[data-tool-shell]').getByRole('button', { name: /field/i })).toHaveCount(0);

    const geometry = await page.evaluate(() => {
      const element = document.querySelector('[data-editor-element][data-editor-active]');
      const rect = (node) => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      return {
        element: rect(element),
        bar: rect(element.querySelector('[data-editor-actions]')),
        // The layout viewport, which is the 390x844 this file asks for.
        // Deliberately not `window.innerWidth`: Chromium's mobile emulation
        // zooms the page out on a transient horizontal overflow, and innerWidth
        // then reports the zoomed-out visual viewport (measured 489x1057 right
        // after the disclosure expands the bar in the next test), which would
        // let this assertion pass for the wrong reason.
        viewport: {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        },
      };
    });

    // The whole point of the ticket: on a phone the old copies were above the
    // top of the screen. Every button of this one is fully within it.
    for (const button of await readButtons(page)) {
      expect(button.left, `${button.label} left`).toBeGreaterThanOrEqual(0);
      expect(button.top, `${button.label} top`).toBeGreaterThanOrEqual(0);
      expect(button.right, `${button.label} right`).toBeLessThanOrEqual(geometry.viewport.width);
      expect(button.bottom, `${button.label} bottom`).toBeLessThanOrEqual(geometry.viewport.height);
    }

    // They are on screen *because* they hang off the element: the bar's bottom
    // edge sits just above the element's top, at Floating UI's own offset,
    // rather than at a sticky card's coordinates. That is the property an
    // on-screen keyboard cannot take away.
    expect(geometry.bar.bottom).toBeLessThanOrEqual(geometry.element.top + ANCHOR_SLACK_PX);
    expect(geometry.element.top - geometry.bar.bottom).toBeLessThan(HIT_TARGET_PX);
  });

  test('the bar is one row while typing, and the disclosure expands it', async ({ page }) => {
    await openWithFixture(page);
    await tapFirstCellHint(page);
    const bar = elementBar(page);
    await expect(bar).toBeVisible();

    const compact = await readBarRows(page);
    expect(compact.height).toBeCloseTo(compact.oneRow, 1);
    // Previous, Next and the disclosure: the whole compact set.
    expect(compact.buttons).toBe(3);
    await expect(bar.getByRole('button', { name: 'Delete element' })).toHaveCount(0);

    // The formatting controls are still one tap away, and the disclosure
    // expands the bar in place rather than opening a popover over the page.
    await bar.getByRole('button', { name: 'Formatting options' }).click();
    // The font trigger is labelled by its own "Aa" preview, so it is found by
    // its title rather than its accessible name (FontPickerMenu.tsx).
    await expect(bar.getByTitle(/^Font: /)).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Text color' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Duplicate element' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Delete element' })).toBeVisible();

    const expanded = await readBarRows(page);
    expect(expanded.buttons).toBeGreaterThan(compact.buttons);
    // Taller by at least a whole further row - the row's own height plus the
    // gap above it, the padding being paid once either way - which is what the
    // compact state is worth: that much less of the document covered while
    // typing.
    expect(expanded.height).toBeGreaterThanOrEqual(compact.height + compact.rowHeight + compact.rowGap - 1);
  });

  test('wrapped rows keep whole 44px hit boxes that do not overlap each other', async ({ page }) => {
    await openWithFixture(page);
    await tapFirstCellHint(page);
    const bar = elementBar(page);
    // The expanded state is the wrapped, multi-row case the row-gap fix
    // targets; the compact one has nothing to collide with.
    await bar.getByRole('button', { name: 'Formatting options' }).click();
    await expect(bar.getByRole('button', { name: 'Delete element' })).toBeVisible();

    const buttons = await readButtons(page);
    const hit = buttons.map((button) => ({
      label: button.label,
      left: button.left - HIT_INSET_PX,
      right: button.right + HIT_INSET_PX,
      top: button.top - HIT_INSET_PX,
      bottom: button.bottom + HIT_INSET_PX,
    }));

    // Still 44px, for every control - the row gap had to make room for the hit
    // box, not the hit box shrink to fit the row.
    for (const box of hit) {
      expect(box.bottom - box.top, `${box.label} hit height`).toBe(HIT_TARGET_PX);
      expect(box.right - box.left, `${box.label} hit width`).toBeGreaterThanOrEqual(HIT_TARGET_PX);
    }

    // If the expanded bar ever stops wrapping at 390px, this guard has stopped
    // guarding anything, so say so here rather than passing vacuously.
    const rows = [...new Set(buttons.map((button) => Math.round(button.top)))].sort((a, b) => a - b);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // The MOBI-16 hazard exactly: before the fix the row pitch was the 28px
    // button plus the bar's 4px gap = 32px, so two rows' 44px hit boxes
    // overlapped vertically by 12px, with Delete sitting in the second row. No
    // pair of buttons on different rows may have intersecting hit boxes.
    for (let i = 0; i < hit.length; i += 1) {
      for (let j = i + 1; j < hit.length; j += 1) {
        if (Math.round(buttons[i].top) === Math.round(buttons[j].top)) continue;
        const overlapX = Math.min(hit[i].right, hit[j].right) - Math.max(hit[i].left, hit[j].left);
        const overlapY = Math.min(hit[i].bottom, hit[j].bottom) - Math.max(hit[i].top, hit[j].top);
        expect(
          overlapX <= 0 || overlapY <= 0,
          `${hit[i].label} and ${hit[j].label} overlap by ${overlapX.toFixed(2)}x${overlapY.toFixed(2)}px`,
        ).toBe(true);
      }
    }

    // The same thing stated as the rule that produces it, so a failure names
    // the cause and not only the symptom: consecutive rows are a full hit box
    // apart (28px button + 16px row-gap = 44px pitch).
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i] - rows[i - 1], `row ${i} pitch`).toBeGreaterThanOrEqual(HIT_TARGET_PX);
    }

    // Deliberately NOT asserted here, and not something this change introduced:
    // two buttons side by side *within* a row of the EXPANDED bar are 4px
    // apart, so their hit boxes still overlap horizontally by 12px. Measured
    // 2026-09-22: 4 such pairs, each 12.0 x 44.0px - the disclosure and the
    // font trigger, the two font-size buttons, Bold and Italic, and
    // Duplicate/Delete. Buttons either side of a `.divider` are 17px apart and
    // do not overlap. Cross-row pairs: none, which is what the row gap bought
    // and what the assertions above hold.
    // Closing it means a 16px column gap across the whole bar, which pushes the
    // expanded set to a third row over the document - the cost MOBI-16 existed
    // to remove - so it is its own ticket, MOBI-20, and not a silent omission.
    // The compact bar, which is the state a phone fills a form in, has no
    // overlapping pair at all; the test below is what holds that.
  });

  // The compact bar is the one MOBI-16 is actually about, and unlike the
  // expanded set it is small enough to space properly, so it gets the whole
  // acceptance line: no two 44px hit boxes intersect, in either axis, at all.
  test('the compact bar has no overlapping hit boxes at all', async ({ page }) => {
    await openWithFixture(page);
    await tapFirstCellHint(page);

    const buttons = await readButtons(page);
    expect(buttons).toHaveLength(3);
    const hit = buttons.map((button) => ({
      label: button.label,
      left: button.left - HIT_INSET_PX,
      right: button.right + HIT_INSET_PX,
      top: button.top - HIT_INSET_PX,
      bottom: button.bottom + HIT_INSET_PX,
    }));

    for (let i = 0; i < hit.length; i += 1) {
      for (let j = i + 1; j < hit.length; j += 1) {
        const overlapX = Math.min(hit[i].right, hit[j].right) - Math.max(hit[i].left, hit[j].left);
        const overlapY = Math.min(hit[i].bottom, hit[j].bottom) - Math.max(hit[i].top, hit[j].top);
        expect(
          overlapX <= 0 || overlapY <= 0,
          `${hit[i].label} and ${hit[j].label} overlap by ${overlapX.toFixed(2)}x${overlapY.toFixed(2)}px`,
        ).toBe(true);
      }
    }

    // Previous and Next are the pair a mis-tap costs most on: the wrong one
    // walks the form backwards. 28px button + 16px gap = a 44px pitch, so they
    // meet at exactly zero rather than 12px inside each other.
    const [previous, next] = buttons;
    expect(next.left - previous.right, 'Previous/Next gap').toBeGreaterThanOrEqual(2 * HIT_INSET_PX);
  });

  test('Next still moves to another field from the element toolbar', async ({ page }) => {
    await openWithFixture(page);
    await tapFirstCellHint(page);

    await activeElement(page).locator('[data-editor-text-input]').fill('Shlomi');

    const first = await activeElement(page).evaluate((node) => ({
      id: node.getAttribute('data-editor-element-id'),
      top: node.getBoundingClientRect().top,
      left: node.getBoundingClientRect().left,
    }));

    const next = elementBar(page).getByRole('button', { name: 'Next field' });
    await expect(next).toBeEnabled();
    await next.click();

    // A different element is the active one now: Next either selects the box
    // already sitting on the following field or creates one there
    // (useFieldNavigation's goTo), and either way the identity changes.
    await expect(activeElement(page)).toHaveCount(1);
    await expect(activeElement(page)).not.toHaveAttribute('data-editor-element-id', first.id);

    // And it is somewhere else on the page, not the same field under a new id.
    // The text just typed stays on the field it was typed into.
    const second = await activeElement(page).evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      left: node.getBoundingClientRect().left,
    }));
    expect(Math.abs(second.top - first.top) + Math.abs(second.left - first.left)).toBeGreaterThan(1);
    await expect(page.locator(`[data-editor-element-id="${first.id}"] [data-editor-text-input]`)).toHaveValue('Shlomi');

    // The bar came with it: the control is on the newly active element, and
    // the newly active element's bar is a compact one row again.
    await expect(elementBar(page).getByRole('button', { name: 'Next field' })).toBeVisible();
    const moved = await readBarRows(page);
    expect(moved.height).toBeCloseTo(moved.oneRow, 1);
  });
});
