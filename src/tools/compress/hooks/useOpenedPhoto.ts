import { useState } from 'preact/hooks';
import type { BatchRow } from '../state/imageBatch.ts';

/** Which photo of the set has its preview open, and which tile takes focus when the person comes back. */
export function useOpenedPhoto(rows: BatchRow[]) {
  // The photo whose preview is open, by file, so a new set (whose ids start over) never opens a stranger.
  const [opened, setOpened] = useState<File | null>(null);
  const openedRow = rows.find((row) => row.file === opened) ?? null;
  // Back from a photo lands on its tile, so the keyboard picks up where the person left the set.
  const [returnTo, setReturnTo] = useState<File | null>(null);
  const back = () => {
    setReturnTo(opened);
    setOpened(null);
  };
  return { openedRow, returnTo, open: setOpened, back };
}
