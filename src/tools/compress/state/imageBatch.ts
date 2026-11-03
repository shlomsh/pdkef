import { compressedFileName } from '../lib/outputName.ts';
import type { OutputPart } from '#lib/output/usePreparedOutput.ts';

/**
 * COMP-04: several photos compressed to one KB target. Pure state, no I/O: the runner
 * (hooks/useImageBatch.ts) feeds events in and reads the selectors out.
 */

type BatchRowStatus = 'waiting' | 'working' | 'done' | 'failed';

export interface BatchRow {
  /** Position in the chosen set, stable for the batch's lifetime. */
  id: number;
  file: File;
  status: BatchRowStatus;
  /** Once done: the result. The input File itself when it was already under the target. */
  blob: Blob | null;
  /** Once done: whether `blob` is at or under the target. */
  metTarget: boolean | null;
  /** Once done: `blob === file`, the photo was already under the target and is kept as it is. */
  passthrough: boolean;
  /** Once done: the save name, unique within the batch. */
  filename: string | null;
}

/** @testSeam */
export interface BatchState {
  rows: BatchRow[];
  targetKB: number;
  /** Bumped by every event that invalidates in-flight work; a result carrying an older run is dropped. */
  run: number;
}

/** @testSeam */
export type BatchEvent =
  | { type: 'filesChosen'; files: File[]; targetKB: number }
  | { type: 'targetChanged'; targetKB: number }
  | { type: 'cleared' }
  | { type: 'rowStarted'; id: number; run: number }
  | { type: 'rowDone'; id: number; run: number; blob: Blob; metTarget: boolean }
  | { type: 'rowFailed'; id: number; run: number };

export const emptyBatch: BatchState = { rows: [], targetKB: 100, run: 0 };

const waiting = (row: BatchRow): BatchRow => ({
  ...row,
  status: 'waiting',
  blob: null,
  metTarget: null,
  passthrough: false,
  filename: null,
});

/** `name`, or `name (2)`, `name (3)`... before the last extension, until no taken name matches (case-insensitive). */
function uniqueName(name: string, taken: (string | null)[]): string {
  const lower = new Set(taken.map((t) => t?.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

export function batchReducer(state: BatchState, event: BatchEvent): BatchState {
  switch (event.type) {
    case 'filesChosen':
      return {
        rows: event.files.map((file, id) => waiting({ id, file } as BatchRow)),
        targetKB: event.targetKB,
        run: state.run + 1,
      };
    case 'targetChanged':
      if (event.targetKB === state.targetKB) return state;
      return { rows: state.rows.map(waiting), targetKB: event.targetKB, run: state.run + 1 };
    case 'cleared':
      return { ...state, rows: [], run: state.run + 1 };
    case 'rowStarted':
    case 'rowFailed':
    case 'rowDone': {
      const row = event.run === state.run ? state.rows.find((r) => r.id === event.id) : undefined;
      if (!row) return state;
      let next: BatchRow;
      if (event.type === 'rowStarted') next = { ...row, status: 'working' };
      else if (event.type === 'rowFailed') next = { ...row, status: 'failed' };
      else {
        const passthrough = event.blob === row.file;
        const base = passthrough ? row.file.name : compressedFileName(row.file.name, event.blob.type || 'image/jpeg');
        const taken = state.rows.filter((r) => r.id !== row.id && r.status === 'done').map((r) => r.filename);
        next = {
          ...row,
          status: 'done',
          blob: event.blob,
          metTarget: event.metTarget,
          passthrough,
          filename: uniqueName(base, taken),
        };
      }
      return { ...state, rows: state.rows.map((r) => (r === row ? next : r)) };
    }
  }
}

/** The first waiting row, or null; null too while a row is working (one at a time). */
export function nextRow(state: BatchState): BatchRow | null {
  if (state.rows.some((r) => r.status === 'working')) return null;
  return state.rows.find((r) => r.status === 'waiting') ?? null;
}

export interface BatchSummary {
  total: number;
  /** Done or failed. */
  finished: number;
  /** Done and at or under the target (a passthrough counts). */
  met: number;
  /** Done but over the target: the smallest result found. */
  missed: number;
  failed: number;
  allFinished: boolean;
}

export function summarizeBatch(state: BatchState): BatchSummary {
  const count = (pick: (r: BatchRow) => boolean) => state.rows.filter(pick).length;
  const total = state.rows.length;
  const failed = count((r) => r.status === 'failed');
  const met = count((r) => r.status === 'done' && !!r.metTarget);
  const missed = count((r) => r.status === 'done' && !r.metTarget);
  const finished = met + missed + failed;
  return { total, finished, met, missed, failed, allFinished: total > 0 && finished === total };
}

/** Every done row's result, in row order, under its unique save name. */
export function batchParts(state: BatchState): OutputPart[] {
  return state.rows.flatMap((r) => (r.status === 'done' && r.blob && r.filename ? [{ blob: r.blob, filename: r.filename }] : []));
}
