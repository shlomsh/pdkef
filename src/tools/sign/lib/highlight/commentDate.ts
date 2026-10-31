// SIGN-44: the last-edited label on a comment card. Pure: `now` is injected.
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** The time when edited today, day and month otherwise, nothing when the comment has no date. */
export function commentDateLabel(commentedAt: number | undefined, now: number, lang: string): string {
  if (commentedAt === undefined) return '';
  const options: Intl.DateTimeFormatOptions = sameDay(new Date(commentedAt), new Date(now))
    ? { hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(lang, options).format(commentedAt);
}
