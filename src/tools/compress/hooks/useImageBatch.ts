import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import type { PreparedOutput, PreparedStatus } from '#lib/output/usePreparedOutput.ts';
import { DEFAULT_QUIET } from '#lib/output/quietPrepare.ts';
import { useHoldUpdate } from '#lib/hooks/useHoldUpdate.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { compressImageToTarget } from '../lib/compressImage.js';
import { usePhotoThumbnails } from './usePhotoThumbnails.ts';
import { batchParts, batchReducer, emptyBatch, nextRow, summarizeBatch } from '../state/imageBatch.ts';

const noop = () => {};

/**
 * COMP-04: runs a set of photos through the single-photo search, one at a time (a canvas per photo is
 * what a phone can spare), and hands the set to the finish flow as a parts output.
 */
export function useImageBatch() {
  const [state, dispatch] = useReducer(batchReducer, emptyBatch);
  // The PDFs dropped among the photos: a PDF compresses on its own, so they are named and left out.
  const [leftOutPdfs, setLeftOutPdfs] = useState<string[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Each row waits for the one before it, even one a target change made stale: the search cannot be
  // aborted, so a new run starts only once the old photo has let go of its canvas.
  const tailRef = useRef<Promise<void>>(Promise.resolve());
  const next = nextRow(state);
  useEffect(() => {
    if (!next) return;
    const { id } = next;
    const { run } = state;
    tailRef.current = tailRef.current.then(async () => {
      const current = stateRef.current;
      const row = current.rows.find((r) => r.id === id);
      if (current.run !== run || row?.status !== 'waiting') return;
      dispatch({ type: 'rowStarted', id, run });
      try {
        const result = await compressImageToTarget(row.file, { targetKB: current.targetKB });
        const { blob, metTarget, width, height, originalWidth, originalHeight } = result;
        dispatch({ type: 'rowDone', id, run, blob, metTarget, dimensions: { width, height, originalWidth, originalHeight } });
      } catch (err) {
        reportError('pdf_tool_run', err, 'compress_batch_image');
        dispatch({ type: 'rowFailed', id, run });
      }
    });
  }, [next?.id, state.run]);

  // A typed target waits for the person to go quiet, as the single photo does; a preset applies at once.
  const targetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setTarget = (targetKB: number, { immediate }: { immediate: boolean }) => {
    if (targetTimerRef.current) clearTimeout(targetTimerRef.current);
    targetTimerRef.current = null;
    if (immediate) dispatch({ type: 'targetChanged', targetKB });
    else targetTimerRef.current = setTimeout(() => dispatch({ type: 'targetChanged', targetKB }), DEFAULT_QUIET.baseMs);
  };
  useEffect(() => () => { if (targetTimerRef.current) clearTimeout(targetTimerRef.current); }, []);

  // One object URL per result, made when a row first needs one and revoked once its result is gone.
  const urlsRef = useRef(new Map<Blob, string>());
  const urlFor = (blob: Blob) => {
    let url = urlsRef.current.get(blob);
    if (!url) {
      url = URL.createObjectURL(blob);
      urlsRef.current.set(blob, url);
    }
    return url;
  };
  useEffect(() => {
    const live = new Set(state.rows.map((r) => r.blob));
    for (const [blob, url] of urlsRef.current) {
      if (live.has(blob)) continue;
      URL.revokeObjectURL(url);
      urlsRef.current.delete(blob);
    }
  });
  useEffect(() => () => { for (const url of urlsRef.current.values()) URL.revokeObjectURL(url); }, []);

  const summary = summarizeBatch(state);
  // There is no draft behind a set: an update reload would drop every photo and result, so hold it.
  useHoldUpdate(summary.total > 0, 'open');
  useHoldUpdate(summary.total > 0 && !summary.allFinished);
  const parts = batchParts(state).map((part) => ({ ...part, url: urlFor(part.blob) }));
  const thumbnails = usePhotoThumbnails(state.rows.map((row) => row.file));
  // The set as one file in the strip: everything picked, against everything Download saves.
  const before = state.rows.reduce((total, row) => total + row.file.size, 0);
  const after = parts.reduce((total, part) => total + part.blob.size, 0);
  const status: PreparedStatus = summary.total === 0 ? 'idle' : !summary.allFinished ? 'pending' : parts.length > 0 ? 'ready' : 'error';
  // The finish flow's view of the set: ready once every photo has finished. A run is ready at most once,
  // so the run number is the generation.
  const prepared: Pick<PreparedOutput, 'status' | 'blob' | 'url' | 'parts' | 'generation' | 'progress' | 'prepareNow'> = {
    status,
    blob: null,
    url: null,
    parts: status === 'ready' ? parts : null,
    generation: state.run,
    progress: summary.total > 0 ? summary.finished / summary.total : 0,
    prepareNow: noop,
  };

  return {
    state,
    /** What the set's layout and the analytics read: still working, done, or every photo failed. */
    phase: status === 'ready' ? 'done' as const : status === 'error' ? 'error' as const : 'processing' as const,
    summary,
    prepared,
    active: summary.total > 0,
    urlFor,
    thumbnails,
    /** The strip's sizes for the whole set, in StripSizes' own shape. */
    strip: { before, compressedSize: after, showResult: status === 'ready', savingsPercent: before > 0 && after > 0 ? Math.round((1 - after / before) * 100) : 0 },
    leftOutPdfs,
    choose: (files: File[], targetKB: number, leftOut: string[] = []) => {
      setLeftOutPdfs(leftOut);
      dispatch({ type: 'filesChosen', files, targetKB });
    },
    setTarget,
    clear: () => {
      setLeftOutPdfs([]);
      if (stateRef.current.rows.length > 0) dispatch({ type: 'cleared' });
    },
    /** Try again after every photo failed: the same set, from the top. */
    retry: () => dispatch({ type: 'filesChosen', files: stateRef.current.rows.map((r) => r.file), targetKB: stateRef.current.targetKB }),
  };
}
