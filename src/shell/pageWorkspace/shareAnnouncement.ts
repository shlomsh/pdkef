/** What a finished Share attempt says to the live region, and whether it counts as the person's Share. */
interface ShareMessages { shared: string; canceled: string; shareError: string }

export function shareOutcome(
  status: string,
  messages: ShareMessages,
): { counted: boolean; announcement: string | null } {
  if (status === 'shared') return { counted: true, announcement: messages.shared };
  if (status === 'canceled') return { counted: false, announcement: messages.canceled };
  if (status === 'error') return { counted: false, announcement: messages.shareError };
  return { counted: false, announcement: null };
}
