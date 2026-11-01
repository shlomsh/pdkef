/** Whether the platform string is an Apple desktop (iPhone and iPad have no Cmd+Z keys to show). */
export function isMacPlatform(platform: string): boolean {
  return /^Mac/i.test(platform);
}

/** The keys useHistoryShortcuts binds (Ctrl+Y also redoes off the Mac), written for the platform: mod+Z undoes, shift+mod+Z redoes. */
export function historyShortcuts(mac: boolean): { undo: string; redo: string } {
  return mac ? { undo: '⌘Z', redo: '⇧⌘Z' } : { undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z' };
}
