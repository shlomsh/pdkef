/**
 * Localized copy for the two cross-link card grids a tool page renders:
 * ToolCrossLinks (the other eight tools, from src/data/tools.js's gridTitle /
 * gridDescription) and RelatedGuides (the guides that hang off this tool,
 * from src/data/contentPages.js's label / blurb).
 *
 * Kept here rather than in those two registries on purpose: tools.js is
 * client-imported (RecentFiles renders from it), so a translation bundle
 * there would ship to every visitor's browser, and contentPages.js is the
 * English registry a content file is cross-checked against. Same pattern as
 * documentationMessages.ts and toolMessages.ts - one typed table per locale,
 * in the file the reviewer pass touches. A card whose slug has no entry here
 * falls back to its English copy; ToolCrossLinks / RelatedGuides say so with
 * the shell's `inEnglish` hint when the target has no edition in the locale.
 */
import type { DocumentationLocaleId } from './documentationLocales';

export interface CardCopy {
  title: string;
  description: string;
}

const hebrewToolCards: Record<string, CardCopy> = {
  sign: {
    title: 'חתימה ומילוי PDF',
    description: 'הוסיפו טקסט, סימוני וי וחתימה לקובץ PDF בטלפון או במחשב. חינם, בלי הרשמה, בלי העלאה.',
  },
  redact: {
    title: 'טשטוש והשחרה',
    description: 'טשטשו אזורים ב-PDF, השחירו פרטים פרטיים או מחקו טקסט ותמונות. הקובץ נשאר במכשיר שלכם.',
  },
  merge: {
    title: 'מיזוג PDF',
    description: 'אחדו כמה קבצי PDF למסמך אחד, בכל סדר, בלי הגבלת עמודים ובלי סימן מים.',
  },
  'pdf-to-image': {
    title: 'PDF לתמונה',
    description: 'המירו עמודי PDF לתמונות JPG או PNG באיכות גבוהה וברזולוציה מלאה, בלי סימן מים.',
  },
  'image-to-pdf': {
    title: 'תמונה ל-PDF',
    description: 'אחדו תמונות JPG או PNG לקובץ PDF אחד באיכות המקורית, בלי סימן מים.',
  },
  split: {
    title: 'פיצול PDF',
    description: 'חלצו עמודים מסוימים או פצלו PDF לכמה קבצים, בלי הגבלת עמודים ובלי סימן מים.',
  },
  compress: {
    title: 'כיווץ PDF',
    description: 'הקטינו PDF לגודל יעד כמו 100KB, עם שליטה באיכות ובלי מכסה יומית.',
  },
  unlock: {
    title: 'הגנה ופתיחה',
    description: 'הוסיפו סיסמה כדי להגן על PDF, או הסירו סיסמה שאתם מכירים.',
  },
  'edit-pdf': {
    title: 'עריכת עמודי PDF',
    description: 'הסירו, סובבו וסדרו מחדש עמודים, והוסיפו מספרי עמודים, הכול במעבר אחד.',
  },
};

const hebrewGuideCards: Record<string, CardCopy> = {
  'sign-pdf-no-signup': {
    title: 'חתימה בלי חשבון',
    description: 'בלי חשבון, בלי אימייל, בלי תקופת ניסיון שנגמרת.',
  },
  'install-pdf-app': {
    title: 'התקנה כאפליקציה',
    description: 'התקינו פעם אחת, וכל כלי כאן עובד גם בלי חיבור לאינטרנט.',
  },
  'offline-pdf-form-filler': {
    title: 'מילוי טופס בלי אינטרנט',
    description: 'בלי העלאה, וזה עובד גם על סריקות ועל PDF בלי שדות אמיתיים.',
  },
  'open-source-pdf-editor': {
    title: 'קוד פתוח ואיך לוודא זאת',
    description: 'רישיון MIT, ובדיקה של דקה שמוכיחה ששום דבר לא מועלה.',
  },
  'blur-vs-blackout-vs-delete-pdf': {
    title: 'טשטוש, השחרה או מחיקה?',
    description: 'מדריך חזותי לכל אפשרות, עם הסבר על השיטוח האוטומטי.',
  },
  'permanently-delete-text-from-pdf': {
    title: 'מחיקת טקסט ותמונות מ-PDF',
    description: 'הסירו רכיבים נבחרים, שמרו את שאר הטקסט, והכירו את המגבלות.',
  },
  'pdf-wont-compress-to-100kb': {
    title: 'למה 100KB לא מספיק',
    description: 'דוגמאות שנמדדו באמת: כמה עמודים נכנסים לפני שהטקסט מתטשטש.',
  },
  'how-to-sign-a-pdf-on-windows': {
    title: 'Windows',
    description: 'חתימה על PDF בלי להדפיס ולסרוק.',
  },
  'how-to-sign-a-pdf-on-mac': {
    title: 'Mac',
    description: 'מה Preview מכסה, ואיפה זה נגמר.',
  },
  'how-to-sign-a-pdf-on-iphone': {
    title: 'iPhone',
    description: 'מה Markup מכסה, ואיפה זה נגמר.',
  },
  'how-to-sign-a-pdf-on-android': {
    title: 'Android',
    description: 'חתימה על PDF באנדרואיד בלי להתקין אפליקציה.',
  },
};

const toolCards: Partial<Record<DocumentationLocaleId, Record<string, CardCopy>>> = { he: hebrewToolCards };
const guideCards: Partial<Record<DocumentationLocaleId, Record<string, CardCopy>>> = { he: hebrewGuideCards };

export function getToolCardCopy(locale: string, slug: string): CardCopy | undefined {
  return toolCards[locale as DocumentationLocaleId]?.[slug];
}

export function getGuideCardCopy(locale: string, pageId: string): CardCopy | undefined {
  return guideCards[locale as DocumentationLocaleId]?.[pageId];
}
