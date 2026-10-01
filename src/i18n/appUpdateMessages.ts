/**
 * MEM-10: the five strings of the update line (`AppUpdateLine.astro`). They
 * live in the static markup, never in the registration script, so the line
 * costs no JavaScript to localize. English for every locale but Hebrew.
 */
export interface AppUpdateMessages {
  ready: string;
  reload: string;
  blocked: string;
  waiting: string;
  dismiss: string;
}

const english: AppUpdateMessages = {
  ready: 'A new version is ready',
  reload: 'Reload',
  blocked: 'Close your other PDkef tabs to load the new version',
  waiting: 'A new version is ready. You can reload once the export finishes.',
  dismiss: 'Hide until the next page',
};

const hebrew: AppUpdateMessages = {
  ready: 'גרסה חדשה מוכנה',
  reload: 'טעינה מחדש',
  blocked: 'סגרו את שאר הלשוניות של PDkef כדי לטעון את הגרסה החדשה',
  waiting: 'גרסה חדשה מוכנה. אפשר לטעון מחדש כשהייצוא יסתיים.',
  dismiss: 'הסתרה עד העמוד הבא',
};

export function getAppUpdateMessages(lang: string): AppUpdateMessages {
  return lang.toLowerCase().startsWith('he') ? hebrew : english;
}
