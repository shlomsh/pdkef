/**
 * MEM-10: the three strings of the update line (`AppUpdateLine.astro`). They
 * live in the static markup, never in the registration script, so the line
 * costs no JavaScript to localize. English for every locale but Hebrew.
 */
export interface AppUpdateMessages {
  ready: string;
  reload: string;
  waiting: string;
}

const english: AppUpdateMessages = {
  ready: 'A new version is ready',
  reload: 'Reload',
  waiting: 'A new version is ready. It loads once the export finishes.',
};

const hebrew: AppUpdateMessages = {
  ready: 'גרסה חדשה מוכנה',
  reload: 'טעינה מחדש',
  waiting: 'גרסה חדשה מוכנה. היא תיטען כשהייצוא יסתיים.',
};

export function getAppUpdateMessages(lang: string): AppUpdateMessages {
  return lang.toLowerCase().startsWith('he') ? hebrew : english;
}
