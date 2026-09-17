import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/* The editor shell is shared by Sign and Redact but deliberately differs from
   ordinary loaded-file shells: its toolbar has its own full row. At phone
   width the file preview must remain attached to the filename/metadata block
   instead of taking a row of its own above it. This is a browser assertion
   because CSS layout, not DOM structure, is the contract. */
test.use({ serviceWorkers: 'block' });

const EDITORS = [
  { name: 'Sign', path: '/sign/', ready: '[class*="page-overlay"]' },
  { name: 'Redact', path: '/redact/', ready: '.redact-draw-area' },
];

async function makePdfBuffer() {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText('Editor identity layout check', { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  return Buffer.from(await document.save());
}

async function openEditor(page, editor, buffer) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(editor.path);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'a-very-long-editor-document-name-that-must-ellipsis-in-the-identity-row.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
  await expect(page.locator(editor.ready).first()).toBeVisible();
}

async function identityGeometry(page) {
  return page.locator('[data-tool-shell]').evaluate((shell) => {
    const identity = shell.firstElementChild;
    const preview = identity?.querySelector(':scope > span:first-child');
    const text = identity?.querySelector(':scope > span:nth-child(2)');
    if (!identity || !preview || !text) return null;
    const rect = (element) => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return { left, right, top, bottom };
    };
    return {
      preview: rect(preview),
      text: rect(text),
      display: getComputedStyle(identity).display,
      previewArea: getComputedStyle(preview).gridArea,
      textArea: getComputedStyle(text).gridArea,
    };
  });
}

for (const editor of EDITORS) {
  test(`${editor.name} keeps its loaded PDF preview inline with the identity text at 390px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, editor, await makePdfBuffer());
    const geometry = await identityGeometry(page);
    expect(geometry).not.toBeNull();
    // Horizontal adjacency plus vertical overlap rules out the old
    // preview-only row above the filename/metadata stack.
    expect(geometry.preview.right).toBeLessThanOrEqual(geometry.text.left);
    expect(geometry.preview.top, JSON.stringify(geometry)).toBeLessThan(geometry.text.bottom);
    expect(geometry.text.top).toBeLessThan(geometry.preview.bottom);
  });

  test(`${editor.name} keeps the editor identity's desktop inline treatment`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openEditor(page, editor, await makePdfBuffer());
    const geometry = await identityGeometry(page);
    expect(geometry).not.toBeNull();
    expect(geometry.preview.right).toBeLessThanOrEqual(geometry.text.left);
    expect(geometry.preview.top).toBeLessThan(geometry.text.bottom);
    expect(geometry.text.top).toBeLessThan(geometry.preview.bottom);
  });
}
