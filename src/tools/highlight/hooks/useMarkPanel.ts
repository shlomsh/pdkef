import { useCallback, useEffect, useState } from 'preact/hooks';
import { useOpenMarks, type OpenMarks } from './useOpenMarks.ts';

/** The highlight whose look the Marker panel is showing (a tap on a phone picks it), or none while the panel edits the pen.
 *  It lets go on its own when the mark leaves `elements` (undo, clear page, replace), so a redo never reopens the panel.
 *  READ-13: `openMarks` adds what else is open in `rootRef`'s page (a note, keyboard focus), for the pencil outline and the fade. */
export function useMarkPanel(elements: readonly { id: string }[], rootRef: { current: HTMLElement | null } = { current: null }): { markId: string | null; pick(id: string): void; release(): void; openMarks: OpenMarks } {
  const [markId, setMarkId] = useState<string | null>(null);
  const pick = useCallback((id: string) => setMarkId(id), []);
  const release = useCallback(() => setMarkId(null), []);
  useEffect(() => {
    if (markId && !elements.some((el) => el.id === markId)) setMarkId(null);
  }, [markId, elements]);
  const openMarks = useOpenMarks(rootRef, markId);
  return { markId, pick, release, openMarks };
}
