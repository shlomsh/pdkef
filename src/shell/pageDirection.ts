/** Whether the page reads right to left. A file name only renders once a file is open, so never at build time; there it counts as left to right. */
export function isRtlPage(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
}
