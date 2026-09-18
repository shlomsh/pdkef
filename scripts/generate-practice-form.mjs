import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import {
  PAGE_SIZE,
  DOCUMENT_META,
  PALETTE,
  HEADER,
  TRIP_NOTICE,
  FIELDS,
  CHECKBOXES,
  SIGNATURE_SECTION,
  FOOTER,
} from '../src/tools/redact/practiceFormContent.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../public/images/redaction-guide/sample.pdf');

const colors = Object.fromEntries(
  Object.entries(PALETTE).map(([key, [r, g, b]]) => [key, rgb(r, g, b)]),
);

function label(page, font, text, x, y) {
  page.drawText(text, { x, y, size: 10, font, color: colors.muted });
}

function addTextField(form, page, font, name, x, y, width, height, { multiline = false } = {}) {
  const field = form.createTextField(name);
  if (multiline) field.enableMultiline();
  field.addToPage(page, {
    x,
    y,
    width,
    height,
    font,
    textColor: colors.ink,
    backgroundColor: colors.field,
    borderColor: colors.teal,
    borderWidth: 0.8,
  });
  field.setFontSize(10);
  return field;
}

/** A single interactive PDF comb field, with printed cells that stay visible
 * even in viewers that do not draw a blank widget's comb separators. */
function addDigitComb(form, page, font, name, x, y, digits, cellWidth = 25, height = 22) {
  const width = digits * cellWidth;
  for (let cell = 0; cell < digits; cell += 1) {
    page.drawRectangle({
      x: x + cell * cellWidth,
      y,
      width: cellWidth,
      height,
      color: colors.field,
      borderColor: colors.teal,
      borderWidth: 0.8,
    });
  }
  const field = form.createTextField(name);
  field.setMaxLength(digits);
  field.enableCombing();
  field.addToPage(page, {
    x,
    y,
    width,
    height,
    font,
    textColor: colors.ink,
    // `addToPage` defaults omitted colours to opaque white. Supplying
    // `undefined` intentionally keeps the widget transparent, so its one
    // interactive comb sits over the nine printed cell outlines.
    backgroundColor: undefined,
    borderColor: undefined,
    borderWidth: 0,
  });
  field.setFontSize(10);
  return field;
}

async function main() {
  const pdf = await PDFDocument.create();
  pdf.setTitle(DOCUMENT_META.title);
  pdf.setAuthor(DOCUMENT_META.author);
  pdf.setSubject(DOCUMENT_META.subject);
  pdf.setKeywords(DOCUMENT_META.keywords);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage(PAGE_SIZE);
  const form = pdf.getForm();

  page.drawRectangle({ x: 0, y: 462, width: 680, height: 38, color: colors.teal });
  page.drawText(HEADER.eyebrow, { x: 38, y: 478, size: 12, font: bold, color: colors.white });

  page.drawText(HEADER.heading, { x: 38, y: 421, size: 25, font: bold, color: colors.ink });
  page.drawText(HEADER.subheading, {
    x: 38, y: 400, size: 11, font, color: colors.muted,
  });

  page.drawRectangle({ x: 38, y: 351, width: 604, height: 34, color: colors.soft });
  page.drawText(TRIP_NOTICE, {
    x: 52, y: 365, size: 10.5, font, color: colors.ink,
  });

  const leftLabel = 38;
  const leftField = 176;
  const fieldWidth = 466;

  const [studentName, parentGuardian, emergencyContact, studentId, allergies] = FIELDS;

  label(page, font, studentName.label, leftLabel, 326);
  addTextField(form, page, font, studentName.name, leftField, 317, fieldWidth, 22);

  label(page, font, parentGuardian.label, leftLabel, 296);
  addTextField(form, page, font, parentGuardian.name, leftField, 287, fieldWidth, 22);

  label(page, font, emergencyContact.label, leftLabel, 266);
  addTextField(form, page, font, emergencyContact.name, leftField, 257, fieldWidth, 22);

  label(page, font, studentId.label, leftLabel, 236);
  addDigitComb(form, page, font, studentId.name, leftField, 227, studentId.digits);

  label(page, font, allergies.label, leftLabel, 200);
  addTextField(form, page, font, allergies.name, leftField, 181, fieldWidth, 34, { multiline: true });

  const [attendCheckbox, photoCheckbox] = CHECKBOXES;

  const permission = form.createCheckBox(attendCheckbox.name);
  permission.addToPage(page, { x: 39, y: 151, width: 14, height: 14, borderColor: colors.teal, borderWidth: 0.8 });
  page.drawText(attendCheckbox.text, { x: 61, y: 154, size: 10.5, font, color: colors.ink });

  const photos = form.createCheckBox(photoCheckbox.name);
  photos.addToPage(page, { x: 39, y: 127, width: 14, height: 14, borderColor: colors.teal, borderWidth: 0.8 });
  page.drawText(photoCheckbox.text, { x: 61, y: 130, size: 10.5, font, color: colors.ink });

  page.drawText(SIGNATURE_SECTION.prompt, { x: 38, y: 105, size: 10.5, font: bold, color: colors.ink });
  label(page, font, SIGNATURE_SECTION.signature.label, 38, 67);
  addTextField(form, page, font, SIGNATURE_SECTION.signature.name, 38, 39, 378, 22);
  label(page, font, SIGNATURE_SECTION.date.label, 440, 67);
  addTextField(form, page, font, SIGNATURE_SECTION.date.name, 440, 39, 202, 22);

  page.drawLine({ start: { x: 38, y: 28 }, end: { x: 642, y: 28 }, thickness: 0.6, color: colors.rule });
  page.drawText(FOOTER.disclaimer, { x: 38, y: 13, size: 8.5, font, color: colors.muted });
  page.drawText(FOOTER.pageNumber, { x: 616, y: 13, size: 8.5, font, color: colors.muted });

  // Explicitly generate widget appearances while leaving every value blank.
  // This makes the form legible in PDF viewers that do not generate appearances themselves.
  form.updateFieldAppearances(font);

  fs.writeFileSync(output, await pdf.save());
  console.log(`Wrote ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
