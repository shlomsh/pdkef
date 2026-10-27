// What the loaded state's page preview shows, as a pure function of the tool's state.
// `source` is which bytes page 1 is drawn from: nothing (the file cannot be drawn yet),
// the file as picked, or the unlocked output. A protected output cannot be drawn without
// its password, so a finished Protect keeps showing the input page.

import { englishSecurityMessages } from '../messages.ts';

/**
 * @param {{ mode: 'unlock' | 'protect' | null, status: string, noPassword: boolean }} state
 * @param {Pick<import('../messages.ts').SecurityMessages, 'tagProtected' | 'tagNotProtected' | 'tagUnlocked' | 'tagRestricted' | 'tagLocked'>} [tags] the tag wording
 * @returns {{ tag: string, source: 'none' | 'input' | 'output', locked: boolean, protectedDone: boolean } | null}
 */
export function planPreview({ mode, status, noPassword }, tags = englishSecurityMessages) {
  if (!mode) return null;
  const done = status === 'done';
  if (mode === 'protect') {
    return { tag: done ? tags.tagProtected : tags.tagNotProtected, source: 'input', locked: false, protectedDone: done };
  }
  if (done) return { tag: tags.tagUnlocked, source: 'output', locked: false, protectedDone: false };
  if (noPassword) return { tag: tags.tagRestricted, source: 'input', locked: false, protectedDone: false };
  return { tag: tags.tagLocked, source: 'none', locked: true, protectedDone: false };
}
