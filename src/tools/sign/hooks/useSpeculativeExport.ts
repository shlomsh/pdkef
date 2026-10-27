import { useEffect } from 'preact/hooks';
import type { SignedExport } from '../lib/exportHandoff.ts';
import { signExportReady } from '../lib/exportHandoff.ts';
import type { SignStatus } from '../state/signState.ts';

// How long to wait after the last edit before speculatively re-exporting in
// the background (MOBI-07). Generous on purpose: re-signing rasterizes every
// page on the device the user is holding, so this must not fire mid-edit.
const SPECULATIVE_EXPORT_DEBOUNCE_MS = 1500;

interface SpeculativeExportOptions {
  file: File | null;
  status: SignStatus;
  elementCount: number;
  documentRevision: number;
  /** Text no bundled font can draw: such a run would be refused anyway. */
  blocked: boolean;
  runExport: (onSigned: (signedBlob: Blob, filename: string) => void, options?: { speculative?: boolean }) => Promise<void>;
  prepare: (blob: Blob, filename: string) => boolean;
  preparedExportRef: { current: SignedExport | null };
  documentRevisionRef: { current: number };
}

// MOBI-07: once at least one element is placed, speculatively re-export on a
// debounced idle so the Share button is already in its ready state by the
// time the user reaches for it, instead of making them tap once to
// generate and again to share. Gated on `status === 'editing'` so this
// never fires mid-load, mid-sign, or while a load error is showing, and on
// `!blocked` so it never burns CPU on a run that would be
// refused anyway. Depending on `documentRevision` (not a raw elements
// reference) means this can only ever fire after a gesture has committed
// its one state update on release - never while a drag/resize/create is
// still live, per the gesture golden rule - and re-fires on every later
// edit, letting each speculative export invalidate the previous one.
export function useSpeculativeExport({
  file, status, elementCount, documentRevision, blocked, runExport, prepare, preparedExportRef, documentRevisionRef,
}: SpeculativeExportOptions): void {
  useEffect(() => {
    if (!file || !signExportReady({ status, elementCount, blocked })) return;
    const timer = setTimeout(() => {
      void runExport((signedBlob, filename) => { // reason: runExport catches its own failure and shows it
        if (prepare(signedBlob, filename)) preparedExportRef.current = { blob: signedBlob, name: filename, revision: documentRevisionRef.current };
      }, { speculative: true });
    }, SPECULATIVE_EXPORT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, documentRevision, blocked, status]);
}
