/** Whether a key or paste is aimed at something the person types into (or a select), so shortcuts stay out of its way. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true || el.getAttribute?.('contenteditable') === 'true';
}
