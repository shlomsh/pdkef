/**
 * Fills the `{placeholder}` tokens of a message template. Dependency-free on purpose: every
 * tool, the shell, the editor chrome and the pages call it, so it sits in `lib` (the bottom
 * layer) rather than beside any one message table.
 */
export function formatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}
