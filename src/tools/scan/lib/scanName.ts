const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Scan 3 Nov 2026": fixed English month names, so the name is the same in every locale and in tests. */
export function defaultScanName(date: Date): string {
  return `Scan ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
