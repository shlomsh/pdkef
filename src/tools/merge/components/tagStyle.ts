/** The colour tag a file carries in the rail and the chip row; six cycle. */
export function tagStyle(index: number): Record<string, string> {
  return { '--tag-color': `var(--color-tag-${(index % 6) + 1})` };
}
