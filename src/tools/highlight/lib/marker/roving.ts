/** Arrow-key focus along a toolbar's buttons: the index to focus next, or null when the key is not ours. */
export function nextFocusIndex(current: number, key: string, count: number, rtl: boolean): number | null {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const step = (key === 'ArrowRight') !== rtl ? 1 : -1;
  return Math.min(count - 1, Math.max(0, current + step));
}

/** Arrow keys in a radio group (the mark panel's colors and its Highlight | Underline switch): the radio to check next,
 * wrapping at the ends, or null when the key is not ours.
 * Home and End are left to the toolbar around the group. `current` is -1 when no radio in the group is checked. */
export function nextRadioIndex(current: number, key: string, count: number, rtl: boolean): number | null {
  if (count === 0) return null;
  const sideways = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : rtl ? -sideways : sideways;
  if (step === 0) return null;
  if (current < 0) return step > 0 ? 0 : count - 1;
  return (current + step + count) % count;
}
