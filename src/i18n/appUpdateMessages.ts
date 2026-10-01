/**
 * MEM-10: the four strings of the update line (`AppUpdateLine.astro`). They
 * live in the static markup, never in the registration script, so the line
 * costs no JavaScript to localize. English for every locale but Hebrew. `critical` is MEM-13's forced update, the
 * same line in its force variant.
 */
export interface AppUpdateMessages {
  waiting: string;
  blocked: string;
  critical: string;
  dismiss: string;
}

const english: AppUpdateMessages = {
  waiting: "A new version is ready. It loads once you're done in your other PDkef tab.",
  blocked: 'A new version is ready. Close your other PDkef tabs to load it.',
  critical: 'An important fix for PDkef is ready. This page reloads in a moment.',
  dismiss: 'Hide until the next page',
};

const hebrew: AppUpdateMessages = {
  waiting: 'גרסה חדשה מוכנה. היא תיטען כשתסיימו בלשונית האחרת של PDkef.',
  blocked: 'גרסה חדשה מוכנה. סגרו את שאר הלשוניות של PDkef כדי לטעון אותה.',
  critical: 'תיקון חשוב ל-PDkef מוכן. העמוד הזה ייטען מחדש בעוד רגע.',
  dismiss: 'הסתרה עד העמוד הבא',
};

export function getAppUpdateMessages(lang: string): AppUpdateMessages {
  return lang.toLowerCase().startsWith('he') ? hebrew : english;
}
