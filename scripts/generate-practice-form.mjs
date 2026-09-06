import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../public/images/redaction-guide/sample.pdf');

const colors = {
  ink: rgb(0.12, 0.25, 0.29),
  muted: rgb(0.32, 0.45, 0.50),
  teal: rgb(0.17, 0.48, 0.56),
  rule: rgb(0.72, 0.81, 0.84),
  soft: rgb(0.93, 0.97, 0.97),
  field: rgb(0.98, 0.995, 0.995),
};

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
function addDigitComb(form, page, font, name, x, y, digits, cellWidth = 25, height = 14) {
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
  pdf.setTitle('PDkef practice form - fictional field trip permission slip');
  pdf.setAuthor('PDkef');
  pdf.setSubject('A blank practice form for Sign & Fill');
  pdf.setKeywords(['PDkef', 'practice', 'field trip', 'permission form']);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([680, 500]);
  const form = pdf.getForm();

  page.drawRectangle({ x: 0, y: 462, width: 680, height: 38, color: colors.teal });
  page.drawText('PDkef / PRACTICE FORM', { x: 38, y: 478, size: 12, font: bold, color: rgb(1, 1, 1) });

  page.drawText('Field Trip Permission Slip', { x: 38, y: 421, size: 25, font: bold, color: colors.ink });
  page.drawText('A blank fictional form for trying text, checkmarks, and a signature.', {
    x: 38, y: 400, size: 11, font, color: colors.muted,
  });

  page.drawRectangle({ x: 38, y: 351, width: 604, height: 34, color: colors.soft });
  page.drawText('Room 12 is going to the Science Museum on Friday, May 14, from 8:00 AM to 3:30 PM.', {
    x: 52, y: 365, size: 10.5, font, color: colors.ink,
  });

  const leftLabel = 38;
  const leftField = 176;
  const fieldWidth = 466;
  label(page, font, "Student's Name", leftLabel, 326);
  addTextField(form, page, font, 'student_name', leftField, 317, fieldWidth, 22);

  label(page, font, 'Parent / Guardian', leftLabel, 296);
  addTextField(form, page, font, 'parent_guardian', leftField, 287, fieldWidth, 22);

  label(page, font, 'Emergency Contact', leftLabel, 266);
  addTextField(form, page, font, 'emergency_contact', leftField, 257, fieldWidth, 22);

  label(page, font, 'Student ID (9 digits)', leftLabel, 236);
  addDigitComb(form, page, font, 'student_id', leftField, 227, 9);

  label(page, font, 'Allergies / Medical Notes', leftLabel, 200);
  addTextField(form, page, font, 'allergies_medical_notes', leftField, 181, fieldWidth, 34, { multiline: true });

  const permission = form.createCheckBox('permission_to_attend');
  permission.addToPage(page, { x: 39, y: 151, width: 14, height: 14, borderColor: colors.teal, borderWidth: 0.8 });
  page.drawText('My child has permission to attend this trip.', { x: 61, y: 154, size: 10.5, font, color: colors.ink });

  const photos = form.createCheckBox('photo_permission');
  photos.addToPage(page, { x: 39, y: 127, width: 14, height: 14, borderColor: colors.teal, borderWidth: 0.8 });
  page.drawText('Photos may be taken during the trip.', { x: 61, y: 130, size: 10.5, font, color: colors.ink });

  page.drawText('Sign below to give permission.', { x: 38, y: 105, size: 10.5, font: bold, color: colors.ink });
  label(page, font, 'Parent or Guardian signature', 38, 67);
  addTextField(form, page, font, 'parent_guardian_signature', 38, 39, 378, 22);
  label(page, font, 'Date', 440, 67);
  addTextField(form, page, font, 'signature_date', 440, 39, 202, 22);

  page.drawLine({ start: { x: 38, y: 28 }, end: { x: 642, y: 28 }, thickness: 0.6, color: colors.rule });
  page.drawText('Fictional form. No real personal data.', { x: 38, y: 13, size: 8.5, font, color: colors.muted });
  page.drawText('1 / 1', { x: 616, y: 13, size: 8.5, font, color: colors.muted });

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
