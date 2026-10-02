import { useState } from 'preact/hooks';
import { getRecentWhiteoutColors, rememberRecentWhiteoutColor } from '../../editor/workspace/preferenceStore.ts';

/** The remembered custom whiteout colours (most recent first) and the call that adds one. */
export function useRecentWhiteoutColors(): readonly [readonly string[], (color: string) => void] {
  const [recents, setRecents] = useState<readonly string[]>(() => getRecentWhiteoutColors());
  const remember = (color: string) => setRecents(rememberRecentWhiteoutColor(color, recents));
  return [recents, remember] as const;
}
