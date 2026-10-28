import { useEffect } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { FileEntry } from '../lib/mergeModel.ts';
import type { MergeAction, LockedProbe } from '../state/mergeState.ts';
import type { NeedsUnlockKind } from '#shell/NeedsUnlock.tsx';

export interface NeedsUnlockView {
  file: File;
  kind: NeedsUnlockKind;
  bytes: ArrayBuffer;
}

/**
 * One protected file is a precondition, not a failure: it gets the shared
 * locked state in place of the result (src/shell/NeedsUnlock.tsx), as in
 * every other tool. Among several files the inline error stays. The probe
 * tells a password from an owner-only restriction; if it cannot say, the
 * inline error shows.
 */
export function useLockedProbe(entries: FileEntry[], lockedProbe: LockedProbe | null, dispatch: Dispatch<MergeAction>) {
  const lockedFile = entries.length === 1 && entries[0].error === 'encrypted' ? entries[0].file : null;
  useEffect(() => {
    if (!lockedFile) return undefined;
    let cancelled = false;
    void (async () => { // reason: the async body catches and reports its own failure
      try {
        const bytes = await lockedFile.arrayBuffer();
        const kind = await probeEncryption(bytes);
        const locked = kind === 'needs-password' || kind === 'owner-restricted';
        if (!cancelled) dispatch({ type: 'LOCK_PROBED', probe: { file: lockedFile, kind: locked ? kind : null, bytes: locked ? bytes : null } });
      } catch (err) {
        reportError('pdf_tool_run', err, 'check_encryption');
        if (!cancelled) dispatch({ type: 'LOCK_PROBED', probe: { file: lockedFile, kind: null, bytes: null } });
      }
    })();
    return () => { cancelled = true; };
  }, [lockedFile, dispatch]);
  // Settled once the probe has answered for this file; until then nothing shows, so the inline error never
  // flashes before the locked state replaces it.
  const probeSettled = !lockedFile || lockedProbe?.file === lockedFile;
  const needsUnlock: NeedsUnlockView | null = lockedFile && probeSettled && lockedProbe?.kind && lockedProbe.bytes
    ? { file: lockedFile, kind: lockedProbe.kind, bytes: lockedProbe.bytes }
    : null;
  // The heading and the one-file box wait for the probe too, so neither shows for a moment and then
  // gives way to the locked state.
  const lockedView = !!needsUnlock || (!!lockedFile && !probeSettled);
  return { needsUnlock, probeSettled, lockedView };
}
