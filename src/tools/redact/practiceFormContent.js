/**
 * Source of truth for the redaction guide's sample form: every string, field
 * name/label/order, the colour palette and the chosen page size.
 *
 * `scripts/generate-practice-form.mjs` imports this module and renders it into
 * the shipped asset `public/images/redaction-guide/sample.pdf`, which
 * `src/shell/FileDropzone.tsx` fetches at runtime as the Redact tool's sample
 * file. Edit the form's words or fields here; drawing logic (pdf-lib calls,
 * layout arithmetic, positions) stays in the script.
 *
 * Dependency-free by design so a plain Node script can import it directly.
 */

/** Page size in points, [width, height]. */
export const PAGE_SIZE = [680, 500];

export const DOCUMENT_META = {
  title: 'PDkef practice form - fictional field trip permission slip',
  author: 'PDkef',
  subject: 'A blank practice form for Sign & Fill',
  keywords: ['PDkef', 'practice', 'field trip', 'permission form'],
};

/** RGB triples (0-1 range), matching `rgb(r, g, b)` from `@cantoo/pdf-lib`. */
export const PALETTE = {
  ink: [0.12, 0.25, 0.29],
  muted: [0.32, 0.45, 0.50],
  teal: [0.17, 0.48, 0.56],
  rule: [0.72, 0.81, 0.84],
  soft: [0.93, 0.97, 0.97],
  field: [0.98, 0.995, 0.995],
  white: [1, 1, 1],
};

export const HEADER = {
  eyebrow: 'PDkef / PRACTICE FORM',
  heading: 'Field Trip Permission Slip',
  subheading: 'A blank fictional form for trying text, checkmarks, and a signature.',
};

export const TRIP_NOTICE = 'Room 12 is going to the Science Museum on Friday, May 14, from 8:00 AM to 3:30 PM.';

/** Text fields and the digit comb, in on-page order, top to bottom. */
export const FIELDS = [
  { name: 'student_name', label: "Student's Name" },
  { name: 'parent_guardian', label: 'Parent / Guardian' },
  { name: 'emergency_contact', label: 'Emergency Contact' },
  { name: 'student_id', label: 'Student ID (9 digits)', kind: 'digitComb', digits: 9 },
  { name: 'allergies_medical_notes', label: 'Allergies / Medical Notes', multiline: true },
];

/** Checkboxes, in on-page order. */
export const CHECKBOXES = [
  { name: 'permission_to_attend', text: 'My child has permission to attend this trip.' },
  { name: 'photo_permission', text: 'Photos may be taken during the trip.' },
];

export const SIGNATURE_SECTION = {
  prompt: 'Sign below to give permission.',
  signature: { name: 'parent_guardian_signature', label: 'Parent or Guardian signature' },
  date: { name: 'signature_date', label: 'Date' },
};

export const FOOTER = {
  disclaimer: 'Fictional form. No real personal data.',
  pageNumber: '1 / 1',
};

/** Every AcroForm field name, in the order the script creates them. */
export const FIELD_NAMES = [
  ...FIELDS.map(f => f.name),
  ...CHECKBOXES.map(c => c.name),
  SIGNATURE_SECTION.signature.name,
  SIGNATURE_SECTION.date.name,
];
