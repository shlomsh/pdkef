/** Arrow-key focus along a toolbar's buttons: the index to focus next, or null when the key is not ours. */
export function nextFocusIndex(current: number, key: string, count: number, rtl: boolean): number | null {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const step = (key === 'ArrowRight') !== rtl ? 1 : -1;
  return Math.min(count - 1, Math.max(0, current + step));
}
