/** The language menu's accessible name. It begins with the visible language name (WCAG 2.5.3, label in name). */
export function languageMenuLabel(visibleName: string, label: string): string {
  return `${visibleName}, ${label}`;
}
