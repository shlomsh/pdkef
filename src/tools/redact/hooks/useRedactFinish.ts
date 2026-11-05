import { useSaveToDrive } from '#shell/pageWorkspace/useSaveToDrive.ts';
import { useDownloaded } from '#shell/RatingPrompt.tsx';
import { finishPhaseOf, type RedactState } from '../state/redactState.ts';
import type { FinishFacts, FinishPhase } from '../lib/finishState.ts';
import useFinishStrip from './useFinishStrip.ts';

/**
 * RED-36: everything the finish row and the status line say, from state that
 * already exists. A page with any box is saved as a picture; a page with only
 * deletions keeps its text (applyPageEdits.js).
 */
export default function useRedactFinish({ state, handleDownloadPdf, outputFileName }: {
  state: RedactState;
  outputFileName: string;
  handleDownloadPdf: () => void;
}) {
  const { elements } = state.edits;
  const { file, numPages, progress } = state.document;
  const { exportedForHandoff } = state.finish;
  const finishPhase: FinishPhase = finishPhaseOf(state);
  const finishFacts: FinishFacts = {
    phase: finishPhase,
    progress,
    fileName: exportedForHandoff?.name ?? (file ? outputFileName : ''),
    pageCount: numPages,
    picturePages: new Set(elements.filter((el) => el.type !== 'delete').map((el) => el.pageIndex)).size,
    boxCount: elements.filter((el) => el.type !== 'delete').length,
    deletionCount: elements.filter((el) => el.type === 'delete').length,
    fileSize: exportedForHandoff?.blob.size ?? null,
  };

  const finishStrip = useFinishStrip(finishPhase, exportedForHandoff);
  const { showStrip, downloadConfirmed, closeStrip } = finishStrip;
  const handleToolbarDownload = () => {
    finishStrip.startToolbarSave();
    handleDownloadPdf();
  };
  // SEO-46's ask is mounted once by the island: in the strip while it is open, else last in the
  // bottom row. Two mounted copies would race for the one device-wide ask.
  const downloaded = useDownloaded();
  const drive = useSaveToDrive({
    tool: 'redact', blob: exportedForHandoff?.blob ?? null, parts: null, fileName: exportedForHandoff?.name ?? '',
    generation: exportedForHandoff, ready: finishPhase === 'saved' && !!exportedForHandoff,
  });

  return { drive, finishFacts, showStrip, downloadConfirmed, closeStrip, handleToolbarDownload, downloaded };
}

export type RedactFinishState = ReturnType<typeof useRedactFinish>;
