import { useEffect, useRef, useState } from 'preact/hooks';
import type { FinishPhase } from '../lib/finishState.ts';
import type { SavedExport } from '../state/redactState.ts';

/**
 * RED-66: the toolbar Download finishes where the person is looking. It asks
 * for the strip under the sticky toolbar; the strip shows once the save lands,
 * stays up through a re-export (Download again, Remove it) so the rating ask in
 * it is not lost, and goes with the next edit (which ends the 'saved' phase), a
 * failed save or the close button. The toolbar button says "Saved" for a moment
 * after each of its own clicks lands, never after a save started elsewhere.
 */
export default function useFinishStrip(finishPhase: FinishPhase, exportedForHandoff: SavedExport | null) {
  const [stripOpen, setStripOpen] = useState(false);
  const [toolbarSaves, setToolbarSaves] = useState(0);
  const [downloadConfirmed, setDownloadConfirmed] = useState(false);
  const confirmedSaveRef = useRef(0);
  const showStrip = stripOpen && (finishPhase === 'saved' || (finishPhase === 'exporting' && exportedForHandoff !== null));
  useEffect(() => {
    if (finishPhase !== 'exporting' && finishPhase !== 'saved') setStripOpen(false);
  }, [finishPhase]);
  // An edit discards the saved export (and a Remove it re-export starts from
  // there): that is the next edit, so the strip goes even if a save follows.
  const hadExportRef = useRef(false);
  useEffect(() => {
    if (hadExportRef.current && exportedForHandoff === null) setStripOpen(false);
    hadExportRef.current = exportedForHandoff !== null;
  }, [exportedForHandoff]);
  useEffect(() => {
    if (!stripOpen || finishPhase !== 'saved' || confirmedSaveRef.current === toolbarSaves) return;
    confirmedSaveRef.current = toolbarSaves;
    setDownloadConfirmed(true);
  }, [stripOpen, finishPhase, toolbarSaves]);
  useEffect(() => {
    if (!downloadConfirmed) return;
    const timer = setTimeout(() => setDownloadConfirmed(false), 2000);
    return () => clearTimeout(timer);
  }, [downloadConfirmed]);
  return {
    showStrip,
    downloadConfirmed,
    closeStrip: () => setStripOpen(false),
    /** The toolbar Download was pressed: ask for the strip and count the save. */
    startToolbarSave: () => {
      setStripOpen(true);
      setToolbarSaves((n) => n + 1);
    },
  };
}
