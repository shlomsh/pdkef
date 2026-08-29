/**
 * User-supplied WYSIWYG regression corpus.
 *
 * These values are test inputs, not executable instructions. Keep the text
 * verbatim: punctuation, combining marks, digit sets, and script order are
 * the behavior each row exists to exercise.
 */
export const WYSIWYG_STRING_CASES = Object.freeze([
  { id: 'H1', text: 'שלום עולם', direction: 'rtl', family: 'Arimo', support: 'supported' },
  { id: 'H2', text: 'בְּרֵאשִׁית בָּרָא', direction: 'rtl', family: 'Arimo', support: 'supported' },
  { id: 'H3', text: 'תאריך 21/08/2026', direction: 'rtl', family: 'Arimo', support: 'supported' },
  { id: 'H4', text: 'סכום 1,250.50 ש"ח', direction: 'rtl', family: 'Arimo', support: 'supported' },
  { id: 'H5', text: 'שם: David Cohen כתובת', direction: 'rtl', family: 'Arimo', support: 'supported' },
  { id: 'H6', text: 'ארץ ישראל ץ ך ם ן ף', direction: 'rtl', family: 'Arimo', support: 'supported' },
  { id: 'H7', text: 'התשנ"ג ר\' יוסף "ציטוט"', direction: 'rtl', family: 'Arimo', support: 'supported' },
  { id: 'A1', text: 'مرحبا بالعالم', direction: 'rtl', family: 'Scheherazade New', support: 'fallback' },
  { id: 'A2', text: 'لا لأ لإ لآ', direction: 'rtl', family: 'Scheherazade New', support: 'fallback' },
  { id: 'A3', text: 'مَرْحَبًا بِٱلْعَالَم', direction: 'rtl', family: 'Scheherazade New', support: 'fallback' },
  { id: 'A4', text: 'المبلغ 1,250.50 ريال', direction: 'rtl', family: 'Scheherazade New', support: 'fallback' },
  { id: 'A5', text: 'التاريخ ٢١/٠٨/٢٠٢٦', direction: 'rtl', family: 'Scheherazade New', support: 'fallback' },
  { id: 'A6', text: 'مرحبا أحمد 1250 ١٢٥٠ Ahmed', direction: 'rtl', family: 'Scheherazade New', support: 'fallback' },
  { id: 'A7', text: 'دار زور ورد', direction: 'rtl', family: 'Scheherazade New', support: 'fallback' },
  { id: 'C1', text: 'Hello World 1250', direction: 'ltr', family: 'Arimo', support: 'supported' },
  { id: 'C2', text: 'שלום Hello مرحبا', direction: 'rtl', family: 'Arimo', support: 'incompatible' },
  { id: 'C3', text: '山田太郎 やまだたろう', direction: 'ltr', family: 'Noto Sans JP', support: 'fallback' },
].map(Object.freeze));

export const WYSIWYG_STRING_BY_ID = Object.freeze(Object.fromEntries(
  WYSIWYG_STRING_CASES.map((entry) => [entry.id, entry]),
));

export const WYSIWYG_ARABIC_CASES = Object.freeze(
  WYSIWYG_STRING_CASES.filter(({ id }) => id.startsWith('A')),
);

// A4-A6 deliberately mix RTL letters with numeric or Latin runs. They belong
// in the bidi-run tests, which mirror production's per-run shaping. The Arabic
// pixel guard shapes one whole RTL run by design, so feeding those mixed cases
// to it would test a pipeline the app does not use.
export const WYSIWYG_ARABIC_SHAPING_CASES = Object.freeze(
  WYSIWYG_ARABIC_CASES.filter(({ id }) => !['A4', 'A5', 'A6'].includes(id)),
);
