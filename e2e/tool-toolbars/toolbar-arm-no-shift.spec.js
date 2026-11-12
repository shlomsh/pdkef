import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openTool as openSharedTool } from '../support/tool.js';
import { makePdfBuffer } from '../support/pdf.js';

/**
 * SIGN-30: arming a tool must never move the toolbar underneath it. The
 * second click of a double-click (or tap of a double-tap) lands where the
 * button WAS, so a status row that grows on arm makes it miss: 12px on
 * desktop, and on a phone with a form the field arrows plus a 3-line armed
 * sentence dropped the toolbar ~28-40px (regressed by e114c8c).
 *
 * Measured directly: the toolbar's top edge before and after arming, under
 * 1px, for every tool that can arm, on both viewports, in Sign (a form with
 * detected fields and a plain PDF) and in Redact. Sign and the More tools arm from
 * their menus, opened with Enter rather than a click: a click also fires the
 * hover opener, so it can open and re-close the popover in one go.
 * Cross-tool, so it lives under `e2e/` (docs/module-boundaries.md rule 7).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIELDS_FIXTURE = fs.readFileSync(path.resolve(
  here, '..', '..', 'src', 'tools', 'sign', 'lib', 'fields', '__fixtures__',
  'income-tax-101-page1-geometry.pdf',
));

const plainPdf = () => makePdfBuffer(null, { title: false, lines: [{ text: 'Toolbar arm-no-shift fixture' }] });

const openTool = (page, url, toolbarName, overlaySelector, buffer) => openSharedTool(page, url, {
  clearStorage: true,
  file: { name: 'arm-no-shift.pdf', buffer },
  overlaySelector,
  toolbarName,
});

const toolbarTop = async (toolbar) => (await toolbar.boundingBox()).y;

// Field detection is a dynamic import plus a content-stream walk; the reserve
// only turns on once it has answered, so wait for its hint outlines before
// taking the "before" measurement.
async function settleFieldDetection(page, toolbar) {
  const textBtn = toolbar.getByRole('button', { name: 'Text', exact: true });
  await textBtn.click();
  await expect(page.locator('[class*="field-hint"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(textBtn).toHaveAttribute('aria-pressed', 'false');
}

async function saveTypedSignature(page, toolbar) {
  await toolbar.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.locator('[data-editor-dialog-tab="type"]').click();
  await page.locator('[data-editor-signature-input]').fill('Test Signer');
  await page.locator('[data-editor-signature-save]').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.keyboard.press('Escape');
}

const MENU_ITEM = {
  Sign: (page) => page.locator('[data-editor-signature-item]').first(),
};

async function expectNoShiftOnArm(page, toolbar, name, isPhone) {
  await page.mouse.move(0, 0);
  const before = await toolbarTop(toolbar);
  const btn = toolbar.getByRole('button', { name, exact: true });
  if (MENU_ITEM[name]) {
    await btn.focus();
    await page.keyboard.press('Enter');
    const item = MENU_ITEM[name](page);
    await expect(item).toBeVisible();
    await item.click();
  } else if (isPhone) {
    await btn.tap();
  } else {
    await btn.click();
  }
  // The keep-on switch is only rendered while a tool is armed.
  await expect(page.getByRole('switch')).toBeVisible();
  const after = await toolbarTop(toolbar);
  expect(Math.abs(after - before), `${name}: toolbar top moved ${after - before}px on arm`).toBeLessThan(1);
  // Retried: Redact's Escape listener re-subscribes in an effect after the
  // arming render, so a keystroke in that same frame can land on the old one.
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('switch')).toHaveCount(0, { timeout: 500 });
  }).toPass();
}

// Sign's toolbar buttons; Highlight, Comment and the shapes arm from the More menu (SIGN-49).
// Arms a tool through the More menu: the toolbar must not move, and the More
// button itself must keep its width when its name becomes the armed tool's.
async function expectNoShiftOnArmFromMore(page, toolbar, name) {
  await page.mouse.move(0, 0);
  const more = toolbar.getByRole('button', { name: 'More', exact: true });
  const before = await toolbarTop(toolbar);
  const widthBefore = (await more.boundingBox()).width;
  await more.focus();
  await page.keyboard.press('Enter');
  const item = page.getByRole('menuitem', { name, exact: true });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByRole('switch')).toBeVisible();
  const armed = toolbar.getByRole('button', { name, exact: true });
  await expect(armed).toHaveAttribute('aria-pressed', 'true');
  const after = await toolbarTop(toolbar);
  expect(Math.abs(after - before), `${name}: toolbar top moved ${after - before}px on arm`).toBeLessThan(1);
  const widthAfter = (await armed.boundingBox()).width;
  expect(Math.abs(widthAfter - widthBefore), `${name}: the More button changed width by ${widthAfter - widthBefore}px`).toBeLessThan(1);
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('switch')).toHaveCount(0, { timeout: 500 });
  }).toPass();
}

const SIGN_TOOLS = ['Text', 'Date', 'Mark', 'Whiteout', 'Sign'];
const SIGN_MORE_TOOLS = ['Highlight', 'Comment', 'Ellipse'];
const REDACT_TOOLS = ['Blur', 'Blackout', 'Whiteout'];

const VIEWPORTS = [
  { name: 'desktop', use: { viewport: { width: 1280, height: 800 } }, isPhone: false },
  { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, isPhone: true },
];

for (const vp of VIEWPORTS) {
  test.describe(`Arming a tool never shifts the toolbar (${vp.name})`, () => {
    test.use(vp.use);

    for (const fixture of ['form with detected fields', 'plain PDF']) {
      test(`Sign, ${fixture}: every tool`, async ({ page }) => {
        const hasFields = fixture !== 'plain PDF';
        const toolbar = await openTool(page, '/sign/?next=0', 'PDF annotations', '[class*="page-overlay"]',
          hasFields ? FIELDS_FIXTURE : await plainPdf());
        if (hasFields) await settleFieldDetection(page, toolbar);
        await saveTypedSignature(page, toolbar);
        for (const name of SIGN_TOOLS) await expectNoShiftOnArm(page, toolbar, name, vp.isPhone);
        for (const name of SIGN_MORE_TOOLS) await expectNoShiftOnArmFromMore(page, toolbar, name);
      });
    }

    test('Redact: every drawing tool', async ({ page }) => {
      const toolbar = await openTool(page, '/redact', 'PDF redaction', '.redact-draw-area', await plainPdf());
      for (const name of REDACT_TOOLS) await expectNoShiftOnArm(page, toolbar, name, vp.isPhone);
    });
  });
}
