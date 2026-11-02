import { useCallback, useState } from 'preact/hooks';

/** The highlight whose look the Marker panel is showing (a tap on a phone picks it), or none while the panel edits the pen. */
export function useMarkPanel(): { markId: string | null; pick(id: string): void; release(): void } {
  const [markId, setMarkId] = useState<string | null>(null);
  const pick = useCallback((id: string) => setMarkId(id), []);
  const release = useCallback(() => setMarkId(null), []);
  return { markId, pick, release };
}
