import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { PDFDocument, PDFName, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import { readDocumentTraces } from '../../../editor/adapters/pdf/documentTraces.js';

// RED-59: the file's details are the person's. An untouched download keeps
// them (and drops only the cached page pictures); an altered or deleted one
// reads back as changed, and the edits survive a reload through the draft.
// jsdom cannot run the real export, the real read-back and the real draft
// restore, so this is the browser guard.

test.use({ serviceWorkers: 'block' });

const ATTACHMENT = 'original-unredacted.pdf';
const N = PDFName.of;

async function makeFixture() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const p1 = doc.addPage([300, 400]);
  const p2 = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  p1.drawText('KEEP ME', { x: 40, y: 320, size: 20, font });
  p1.drawText('SECRET 123', { x: 40, y: 80, size: 20, font });

  const thumb = () => ctx.register(ctx.stream(new Uint8Array(16), {
    Type: 'XObject', Subtype: 'Image', Width: 4, Height: 4, ColorSpace: 'DeviceGray', BitsPerComponent: 8,
  }));
  const spec = (name, payload) => ctx.register(ctx.obj({
    Type: 'Filespec', F: PDFString.of(name), UF: PDFString.of(name),
    EF: { F: ctx.register(ctx.stream(payload, { Type: 'EmbeddedFile' })) },
  }));

  const info = doc.getInfoDict();
  info.set(N('Title'), PDFString.of('Lease draft'));
  info.set(N('Author'), PDFString.of('Dana Levi'));
  info.set(N('Creator'), PDFString.of('CamScanner'));
  info.set(N('CreationDate'), PDFString.of("D:20261007091400+03'00'"));

  doc.catalog.set(N('Names'), ctx.obj({
    EmbeddedFiles: { Names: [PDFString.of(ATTACHMENT), spec(ATTACHMENT, '%PDF-1.7 the unredacted original')] },
  }));
  p1.node.set(N('Thumb'), thumb());
  p2.node.set(N('Thumb'), thumb());
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function savedBytes(download) {
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  return fs.readFileSync(savedPath);
}

async function openAndMark(page) {
  await page.goto('/redact/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'lease.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
  await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
  const toolbar = page.getByRole('toolbar', { name: 'PDF redaction' });
  const blackout = toolbar.getByRole('button', { name: 'Blackout', exact: true });
  if ((await blackout.getAttribute('aria-pressed')) !== 'true') await blackout.click();
  await expect(blackout).toHaveAttribute('aria-pressed', 'true');
  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await expect(page.locator('.redact-drawing-preview')).toHaveCount(1);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.36, { steps: 6 });
  await page.waitForTimeout(50);
  await page.mouse.up();
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);
  return toolbar;
}

async function download(page, toolbar) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    toolbar.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  return PDFDocument.load(await savedBytes(file), { updateMetadata: false });
}

test.describe('Redact keeps the file\'s details unless the person changes them', () => {
  test('an untouched download keeps title, author and the attachment, and drops the page pictures', async ({ page }) => {
    const toolbar = await openAndMark(page);
    const doc = await download(page, toolbar);
    expect(doc.getTitle()).toBe('Lease draft');
    expect(doc.getAuthor()).toBe('Dana Levi');
    expect(readDocumentTraces(doc).attachments.map((a) => a.name)).toContain(ATTACHMENT);
    for (const p of doc.getPages()) expect(p.node.get(N('Thumb'))).toBeUndefined();
    await expect(page.locator('[data-details-changed]')).toHaveCount(0);
    await expect(page.locator('[data-details-survived]')).toHaveCount(0);
  });

  test('altering the title and deleting the author is applied, said, and survives a reload', async ({ page }) => {
    const toolbar = await openAndMark(page);
    const footer = page.locator('[data-details-footer]');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('Dana Levi');

    // A long summary ellipsises inside the page's width on a phone, and Review stays on screen.
    await page.setViewportSize({ width: 375, height: 812 });
    await footer.scrollIntoViewIfNeeded();
    const fit = await footer.evaluate((el) => {
      const card = document.querySelector('[data-editor-page-card]').getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const review = el.querySelector('button').getBoundingClientRect();
      return { left: box.left - card.left, right: card.right - box.right, reviewRight: window.innerWidth - review.right };
    });
    expect(fit.left).toBeGreaterThanOrEqual(-1);
    expect(fit.right).toBeGreaterThanOrEqual(-1);
    expect(fit.reviewRight).toBeGreaterThan(0);
    await page.setViewportSize({ width: 1600, height: 1000 });

    const sheet = page.locator('dialog[open]');
    const openSheet = async () => {
      await footer.getByRole('button', { name: 'Review', exact: true }).click();
      await expect(sheet).toBeVisible();
    };
    await openSheet();
    await sheet.locator('[data-detail-row="author"]').getByRole('button', { name: 'Delete Author', exact: true }).click();
    await expect(sheet.locator('[data-detail-row="author"]')).toHaveAttribute('data-detail-state', 'deleted');
    const title = sheet.locator('[data-detail-row="title"]');
    await title.getByRole('button', { name: 'Edit Title', exact: true }).click();
    await title.locator('input').fill('Declaration');
    await title.getByRole('button', { name: 'Done Title', exact: true }).click();
    await expect(title).toHaveAttribute('data-detail-state', 'altered');
    await sheet.getByRole('button', { name: 'Done', exact: true }).first().click();
    await expect(sheet).toHaveCount(0);

    const doc = await download(page, toolbar);
    await expect(page.locator('[data-details-changed]')).toContainText('Details: title altered, author deleted.');
    await expect(page.locator('[data-details-survived]')).toHaveCount(0);
    expect(doc.getAuthor()).toBeUndefined();
    expect(doc.getTitle()).toBe('Declaration');

    await page.waitForTimeout(1500);
    await page.reload();
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await expect(footer).toBeVisible();
    await openSheet();
    await expect(sheet.locator('[data-detail-row="author"]')).toHaveAttribute('data-detail-state', 'deleted');
    await expect(sheet.locator('[data-detail-row="title"]')).toHaveAttribute('data-detail-state', 'altered');
    await expect(sheet.locator('[data-detail-row="title"]')).toContainText('Declaration');
  });
});
