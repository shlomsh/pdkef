/* MERGE-11: the one remembered option, on device, under the existing
   `pdf-toolkit:` prefix. A person who always wants page numbers sets it
   once; nothing is sent anywhere. */
const OPTIONS_KEY = 'pdf-toolkit:merge:options';

export function readRememberedOptions(): { addPageNumbers: boolean } {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return { addPageNumbers: false };
    const parsed = JSON.parse(raw);
    return { addPageNumbers: parsed?.addPageNumbers === true };
  } catch {
    // expected: a stored preference that cannot be read falls back to the default
    return { addPageNumbers: false };
  }
}

export function rememberOptions(options: { addPageNumbers: boolean }) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // expected: blocked localStorage, remembering is a convenience
  }
}
