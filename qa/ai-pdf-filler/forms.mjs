/**
 * Layout source for the four AI-04 trial fixtures. One source, several outputs: `generate.mjs`
 * draws the flat PDF from it, rasterises that into the scanned variant, and derives the expected
 * fields from these same rects, so the drawing and the answer key can never drift apart.
 *
 * Coordinates here are PDF points on an A4 page (595 x 842), origin at the page's TOP-LEFT corner,
 * y growing downwards. `generate.mjs` converts to PDF user space (bottom-left origin) when drawing
 * and records every other system in `expected/*.json`.
 *
 * A field `rect` is the writable area: the inside of a drawn box, the space above a drawn line
 * (signature), or a checkbox square. Labels sit outside the rect. Every person, address, number
 * and organisation here is fictional.
 */

export const PAGE = { width: 595, height: 842 };

export const SYNTHETIC_BANNER = {
  en: 'SYNTHETIC TEST FORM - fictional organisation, not a real document',
  he: 'טופס בדיקה סינתטי - ארגון בדיוני, לא מסמך אמיתי',
};

/** English: a left-to-right community garden application. */
const EN = {
  id: 'en',
  direction: 'ltr',
  font: { regular: 'Arimo-Regular.ttf', bold: 'Arimo-Bold.ttf' },
  title: 'Riverbend Community Garden',
  subtitle: 'Allotment Plot Application 2027',
  sections: [
    { heading: '1. Applicant details', y: 132 },
    { heading: '2. Plot request', y: 388 },
    { heading: '3. Declaration', y: 574 },
  ],
  paragraphs: [
    {
      y: 596,
      lines: [
        'I confirm that the information above is correct and that I have read the garden rules.',
        'I understand that plots are allocated in the order applications are received.',
      ],
    },
  ],
  groups: { plot_size: { label: 'Plot size (tick one)', y: 406 } },
  officeBox: { x: 48, y: 734, width: 499, height: 58, heading: 'For office use only - do not write in this box' },
  footer: 'Form RCG-APP-27 (synthetic) - page 1 of 1',
  fields: [
    { id: 'full_name', label: 'Full name', kind: 'text', rect: { x: 48, y: 158, width: 320, height: 22 } },
    { id: 'member_number', label: 'Member number', kind: 'comb', cells: 8, rect: { x: 387, y: 158, width: 160, height: 22 } },
    { id: 'date_of_birth', label: 'Date of birth (DD/MM/YYYY)', kind: 'date', rect: { x: 48, y: 210, width: 150, height: 22 } },
    { id: 'phone', label: 'Phone', kind: 'text', rect: { x: 217, y: 210, width: 150, height: 22 } },
    { id: 'email', label: 'Email', kind: 'text', rect: { x: 387, y: 210, width: 160, height: 22 } },
    { id: 'street_address', label: 'Street address', kind: 'text', rect: { x: 48, y: 262, width: 499, height: 22 } },
    { id: 'city', label: 'Town / city', kind: 'text', rect: { x: 48, y: 314, width: 320, height: 22 } },
    { id: 'postcode', label: 'Postcode', kind: 'text', rect: { x: 387, y: 314, width: 160, height: 22 } },
    { id: 'plot_small', label: 'Small plot (2 x 3 m)', kind: 'checkbox', group: 'plot_size', rect: { x: 48, y: 414, width: 12, height: 12 } },
    { id: 'plot_medium', label: 'Medium plot (3 x 4 m)', kind: 'checkbox', group: 'plot_size', rect: { x: 214, y: 414, width: 12, height: 12 } },
    { id: 'plot_large', label: 'Large plot (4 x 6 m)', kind: 'checkbox', group: 'plot_size', rect: { x: 380, y: 414, width: 12, height: 12 } },
    { id: 'preferred_start', label: 'Preferred start date', kind: 'date', rect: { x: 48, y: 462, width: 150, height: 22 } },
    { id: 'needs_raised_bed', label: 'I need a raised bed for accessibility', kind: 'checkbox', rect: { x: 48, y: 506, width: 12, height: 12 } },
    { id: 'joins_watering_rota', label: 'I would like to join the summer watering rota', kind: 'checkbox', rect: { x: 48, y: 530, width: 12, height: 12 } },
    { id: 'signature', label: 'Signature', kind: 'signature', line: true, rect: { x: 48, y: 652, width: 280, height: 34 } },
    { id: 'signed_date', label: 'Date', kind: 'date', rect: { x: 397, y: 664, width: 150, height: 22 } },
    { id: 'office_received', label: 'Received by (office)', kind: 'text', officeUse: true, rect: { x: 60, y: 764, width: 220, height: 20 } },
  ],
};

/** Hebrew: a right-to-left neighbourhood library membership request, mirrored layout. */
const HE = {
  id: 'he',
  direction: 'rtl',
  font: { regular: 'Heebo-Regular.ttf', bold: 'Heebo-Bold.ttf' },
  title: 'ספריית שכונת הגפן',
  subtitle: 'בקשה להצטרפות כמנוי - 2027',
  sections: [
    { heading: '1. פרטי המבקש/ת', y: 132 },
    { heading: '2. סוג המנוי', y: 388 },
    { heading: '3. הצהרה', y: 574 },
  ],
  paragraphs: [
    {
      y: 596,
      lines: [
        'אני מצהיר/ה כי הפרטים שמסרתי נכונים וכי קראתי את תקנון הספרייה.',
        'ידוע לי כי ספרים יש להחזיר תוך 21 יום (ניתן להאריך פעם אחת).',
      ],
    },
  ],
  groups: { membership_tier: { label: 'סוג המנוי (יש לסמן אחד)', y: 406 } },
  officeBox: { x: 48, y: 734, width: 499, height: 58, heading: 'לשימוש המשרד בלבד - נא לא למלא' },
  footer: 'טופס ספ-27 (סינתטי) - עמוד 1 מתוך 1',
  fields: [
    { id: 'full_name', label: 'שם מלא', kind: 'text', rect: { x: 227, y: 158, width: 320, height: 22 } },
    { id: 'id_number', label: 'מספר זהות', kind: 'comb', cells: 9, rect: { x: 48, y: 158, width: 162, height: 22 } },
    { id: 'date_of_birth', label: 'תאריך לידה (יום/חודש/שנה)', kind: 'date', rect: { x: 397, y: 210, width: 150, height: 22 } },
    { id: 'phone', label: 'טלפון נייד', kind: 'text', rect: { x: 228, y: 210, width: 150, height: 22 } },
    { id: 'email', label: 'דוא"ל (Email)', kind: 'text', rect: { x: 48, y: 210, width: 160, height: 22 } },
    { id: 'street_address', label: 'רחוב ומספר בית', kind: 'text', rect: { x: 48, y: 262, width: 499, height: 22 } },
    { id: 'city', label: 'יישוב', kind: 'text', rect: { x: 227, y: 314, width: 320, height: 22 } },
    { id: 'postcode', label: 'מיקוד', kind: 'text', rect: { x: 48, y: 314, width: 160, height: 22 } },
    { id: 'tier_adult', label: 'מבוגר/ת', kind: 'checkbox', group: 'membership_tier', rect: { x: 535, y: 414, width: 12, height: 12 } },
    { id: 'tier_student', label: 'סטודנט/ית', kind: 'checkbox', group: 'membership_tier', rect: { x: 369, y: 414, width: 12, height: 12 } },
    { id: 'tier_senior', label: 'גמלאי/ת', kind: 'checkbox', group: 'membership_tier', rect: { x: 203, y: 414, width: 12, height: 12 } },
    { id: 'membership_start', label: 'תאריך תחילת המנוי', kind: 'date', rect: { x: 397, y: 462, width: 150, height: 22 } },
    { id: 'wants_email_updates', label: 'אשמח לקבל עדכונים על אירועים בדוא"ל', kind: 'checkbox', rect: { x: 535, y: 506, width: 12, height: 12 } },
    { id: 'wants_home_delivery', label: 'אני זקוק/ה למשלוח ספרים עד הבית', kind: 'checkbox', rect: { x: 535, y: 530, width: 12, height: 12 } },
    { id: 'signature', label: 'חתימה', kind: 'signature', line: true, rect: { x: 267, y: 652, width: 280, height: 34 } },
    { id: 'signed_date', label: 'תאריך', kind: 'date', rect: { x: 48, y: 664, width: 150, height: 22 } },
    { id: 'office_received', label: 'התקבל על ידי (משרד)', kind: 'text', officeUse: true, rect: { x: 315, y: 764, width: 220, height: 20 } },
  ],
};

export const FORMS = { en: EN, he: HE };

/**
 * The four fixtures. `scan` renders the flat form at `dpi`, applies the recorded, deterministic
 * scan effects, and stores the page as a single image with no text layer and no fields.
 */
export const VARIANTS = [
  { name: 'en-flat', form: 'en', scan: null },
  { name: 'en-scan', form: 'en', scan: { dpi: 150, rotateDeg: 0.6, offsetPx: { x: 6, y: -4 }, seed: 11 } },
  { name: 'he-flat', form: 'he', scan: null },
  { name: 'he-scan', form: 'he', scan: { dpi: 150, rotateDeg: -0.5, offsetPx: { x: -5, y: 3 }, seed: 23 } },
];
