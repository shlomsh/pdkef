import { useCallback, useEffect, useState } from 'preact/hooks';

/** The highlight whose look the Marker panel is showing (a tap on a phone picks it), or none while the panel edits the pen.
 *  It lets go on its own when the mark leaves `elements` (undo, clear page, replace), so a redo never reopens the panel. */
export function useMarkPanel(elements: readonly { id: string }[]): { markId: string | null; pick(id: string): void; release(): void } {
  const [markId, setMarkId] = useState<string | null>(null);
  const pick = useCallback((id: string) => setMarkId(id), []);
  const release = useCallback(() => setMarkId(null), []);
  useEffect(() => {
    if (markId && !elements.some((el) => el.id === markId)) setMarkId(null);
  }, [markId, elements]);
  return { markId, pick, release };
}
