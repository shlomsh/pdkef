import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { PDFDocument, PDFName, PDFString, PDFHexString, StandardFonts, drawObject, pushGraphicsState, popGraphicsState } from '@cantoo/pdf-lib';
import { readDocumentTraces, hasNoTraces } from '../../../editor/adapters/pdf/documentTraces.js';

// RED-59: every Redact export drops the file's hidden details (Info, XMP,
// attachments, scripts, thumbnails, page-level details), says so in the saved-
// file check after reading the download back, and keeps an attachment only
// when the person asks. jsdom cannot run the real export, the real read-back
// and the real second export, so this is the browser guard.

const ATTACHMENT = 'original-unredacted.pdf';
const SOURCE_ID = '00112233445566778899AABBCCDDEEFF';
const N = PDFName.of;

async function makeFixture() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const p1 = doc.addPage([300, 400]);
  const p2 = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  p1.drawText('KEEP ME', { x: 40, y: 320, size: 20, font });
  p1.drawText('SECRET 123', { x: 40, y: 80, size: 20, font });

  const xmp = (m) => ctx.register(ctx.stream(
    `<?xpacket begin=""?><x:xmpmeta><!-- ${m} xmpMM:History --></x:xmpmeta><?xpacket end="w"?>`,
    { Type: 'Metadata', Subtype: 'XML' },
  ));
  const js = (m) => ctx.obj({ Type: 'Action', S: 'JavaScript', JS: PDFString.of(m) });
  const spec = (name, payload) => ctx.register(ctx.obj({
    Type: 'Filespec', F: PDFString.of(name), UF: PDFString.of(name),
    EF: { F: ctx.register(ctx.stream(payload, { Type: 'EmbeddedFile' })) },
  }));
  const thumb = () => ctx.register(ctx.stream(new Uint8Array(16), {
    Type: 'XObject', Subtype: 'Image', Width: 4, Height: 4, ColorSpace: 'DeviceGray', BitsPerComponent: 8,
  }));

  const info = doc.getInfoDict();
  info.set(N('Title'), PDFString.of('Lease draft'));
  info.set(N('Author'), PDFString.of('Dana Levi'));
  info.set(N('Subject'), PDFString.of('Lease for 12 Herzl St'));
  info.set(N('Keywords'), PDFString.of('lease, draft'));
  info.set(N('Creator'), PDFString.of('CamScanner'));
  info.set(N('Producer'), PDFString.of('iPhone 15 Pro'));
  info.set(N('CreationDate'), PDFString.of("D:20261007091400+03'00'"));
  info.set(N('ModDate'), PDFString.of("D:20261007091400+03'00'"));
  info.set(N('Company'), PDFString.of('Acme'));

  doc.catalog.set(N('Metadata'), xmp('CATALOG'));
  doc.catalog.set(N('OpenAction'), ctx.register(js('OPEN_SCRIPT')));
  doc.catalog.set(N('Names'), ctx.obj({
    EmbeddedFiles: { Names: [PDFString.of(ATTACHMENT), spec(ATTACHMENT, '%PDF-1.7 the unredacted original')] },
    JavaScript: { Names: [PDFString.of('DocJs'), js('NAMED_SCRIPT')] },
  }));

  p1.node.set(N('Thumb'), thumb());
  p2.node.set(N('Thumb'), thumb());
  p2.node.set(N('AA'), ctx.obj({ O: js('PAGE_SCRIPT') }));
  p2.node.set(N('Annots'), ctx.obj([ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'FileAttachment', Rect: [10, 10, 30, 30], Name: 'PushPin',
    FS: spec('comment.txt', 'COMMENT_ATTACHMENT'), F: 4,
  }))]));
  p2.node.set(N('Metadata'), xmp('PAGE'));
  p2.node.set(N('PieceInfo'), ctx.obj({ App: { LastModified: PDFString.of('PAGE_PIECE') } }));
  const img = ctx.register(ctx.stream(new Uint8Array([0, 128, 255, 64]), {
    Type: 'XObject', Subtype: 'Image', Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8,
    Metadata: xmp('IMG'),
  }));
  const imgName = p2.node.newXObject('Im1', img);
  p2.pushOperators(pushGraphicsState(), drawObject(imgName), popGraphicsState());

  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(SOURCE_ID), PDFHexString.of(SOURCE_ID)]);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function savedBytes(download) {
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  return fs.readFileSync(savedPath);
}

// The trailer /ID of a saved file, as the two hex strings, read from the raw
// bytes (a classic trailer or an xref-stream dictionary both spell it /ID[<..><..>]).
function trailerId(bytes) {
  const m = Buffer.from(bytes).toString('latin1').match(/\/ID\s*\[\s*<([0-9A-Fa-f]+)>/);
  return m ? m[1].toUpperCase() : null;
}

async function expectStripped(bytes, { keep = [] } = {}) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const traces = readDocumentTraces(doc);
  if (keep.length === 0) {
    expect(hasNoTraces(traces), JSON.stringify(traces)).toBe(true);
  } else {
    // pdf-lib's attach() lists one file in both the name tree and /AF, which
    // readDocumentTraces counts twice, so compare the distinct names.
    expect([...new Set(traces.attachments.map((a) => a.name))]).toEqual(keep);
    expect(hasNoTraces({ ...traces, attachments: [] }), JSON.stringify(traces)).toBe(true);
  }
  const raw = Buffer.from(bytes).toString('latin1');
  expect(raw).not.toContain('Dana Levi');
  expect(raw).not.toContain('CamScanner');
  expect(raw).not.toContain('pdf-lib');
  const id = trailerId(bytes);
  expect(id, 'the saved file has a trailer /ID').not.toBeNull();
  expect(id).not.toBe(SOURCE_ID);
}

async function openAndRedact(page, how) {
  await page.goto('/redact');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'lease.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
  await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
  const toolbar = page.getByRole('toolbar', { name: 'PDF redaction' });
  if (how === 'delete') {
    await toolbar.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.locator('[class*="delete-candidate"][title*="SECRET 123"]').click();
  } else {
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
  }
  return () => toolbar.getByRole('button', { name: 'Download', exact: true }).click();
}

async function expectReadBack(page) {
  const traces = page.locator('[data-traces]');
  await expect(traces).toContainText(/CamScanner on an iPhone, 7 Oct/);
  await expect(traces).toContainText(`Attached: ${ATTACHMENT}`);
  await expect(traces).toContainText('Scripts that run on open');
  await expect(traces).toContainText('A small picture of pages 1 and 2 as they were');
  await expect(traces).toContainText('Hidden details on page 2');
  await expect(traces).toContainText('Read back from your download: none of it is there.');
  await expect(page.locator('[data-trace-survived]')).toHaveCount(0);
  return traces;
}

test.describe('Redact drops hidden details from every download', () => {
  test('a Delete export is clean, read back, and announced', async ({ page }) => {
    const live = page.locator('.sr-only[role="status"]');
    await page.addInitScript(() => {
      window.__liveSeen = false;
      new MutationObserver(() => {
        for (const el of document.querySelectorAll('.sr-only[role="status"]')) {
          if (/Checked your download/.test(el.textContent || '')) window.__liveSeen = true;
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    const download = await openAndRedact(page, 'delete');
    const [file] = await Promise.all([page.waitForEvent('download'), download()]);
    await expectStripped(await savedBytes(file));
    await expectReadBack(page);
    await expect(live.first()).toBeAttached();
    await expect.poll(() => page.evaluate(() => window.__liveSeen)).toBe(true);
  });

  test('a Blackout export is clean, and Keep it brings back only the attachment', async ({ page }) => {
    const download = await openAndRedact(page, 'blackout');
    const [file] = await Promise.all([page.waitForEvent('download'), download()]);
    await expectStripped(await savedBytes(file));
    const traces = await expectReadBack(page);

    const row = traces.locator('[data-trace-row]', { hasText: `Attached: ${ATTACHMENT}` });
    const [kept] = await Promise.all([
      page.waitForEvent('download'),
      row.getByRole('button', { name: 'Keep it in the download', exact: true }).click(),
    ]);
    await expectStripped(await savedBytes(kept), { keep: [ATTACHMENT] });
    const keptRow = page.locator('[data-traces] [data-trace-row]', { hasText: ATTACHMENT });
    await expect(keptRow).toContainText('Kept in your download.');
    await expect(keptRow.getByRole('button', { name: 'Drop it', exact: true })).toBeVisible();
  });
});
