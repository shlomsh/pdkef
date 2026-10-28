// A person-typed output file name made safe to hand to a download. Path
// separators and "+" are dropped ("+" so the merged name can never read like
// the old "<first> + N more" template, whichever way one got in), control
// characters go, runs of spaces collapse. Deliberately not a filesystem-
// reserved-character denylist beyond that: the browser's own download
// mechanism turns the string into a real file name. Unicode is kept as typed
// (a Hebrew or Arabic name included); the cap counts code points via
// Array.from, not UTF-16 length, so it can never split a surrogate pair.
export function sanitizeOutputName(raw: string): string {
  const stripped = raw
    .replace(/[\\/+]/g, '')
    .replace(/\p{Cc}/gu, '')
    .replace(/ {2,}/g, ' ');
  const trimmed = stripped.trim();
  const codepoints = Array.from(trimmed);
  return codepoints.length > 120 ? codepoints.slice(0, 120).join('') : trimmed;
}
