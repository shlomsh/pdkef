import { useEffect, useRef } from 'preact/hooks';
import { takeHandoff } from './drafts/draftStore.js';
import { handoffFitsPage, handoffKindsForPage } from './handoffKinds.ts';
import { markArrival } from './fileArrival.ts';
import { ANALYTICS_TOOLS, type AnalyticsTool } from './usageEventSchema.ts';
import { clearHandoffPending, releaseHandoffPending, releaseHandoffPendingWhenLoaded } from './handoffPending.ts';

type HandoffFile = { fileName: string; fileType?: string; fileBytes: ArrayBuffer };
type HandoffRecord = Partial<HandoffFile> & { files?: Partial<HandoffFile>[]; from?: string };

/**
 * Every file a hand-off record carries, in order: one for a single record, all of
 * `files` for a multi record (SITE-42), `[]` for anything invalid.
 */
export function filesFromHandoff(record: HandoffRecord | null | undefined): File[] {
  if (!record) return [];
  const entries = Array.isArray(record.files) ? record.files : [record];
  if (entries.length === 0 || !entries.every((e) => e && e.fileBytes)) return [];
  return entries.map(
    (e) => new File([e.fileBytes as ArrayBuffer], e.fileName as string, { type: e.fileType || 'application/pdf' }),
  );
}

/** DEBT-58: say the file about to open came by hand-off; `from` only when the sender is an analytics tool. */
export function markHandoffArrival(from: unknown): void {
  const known = (ANALYTICS_TOOLS as readonly unknown[]).includes(from);
  markArrival('handoff', known ? (from as AnalyticsTool) : undefined);
}

/**
 * MERGE-14: collect a pending hand-off for `tool` on mount and hand the
 * rebuilt File to `onFile`.
 *
 * Sign and Redact already resolve a hand-off through
 * `useEditorDraftPersistence.ts`'s `beforeRestore`, ahead of their own draft
 * restore (a hand-off is a file dropped one navigation ago, so it outranks a
 * saved draft - see that file's comment). Compress and Split have no draft to
 * race against, so mount is enough: nothing else is competing to load a file
 * first.
 *
 * `takeHandoff` is read-and-delete (a hand-off is a one-shot baton - see
 * draftStore.js), and already returns null when IndexedDB is unavailable, so
 * there is nothing to special-case here for that.
 *
 * `from` is the sending tool, when its record names one (Redact does, so Unlock can lead the person
 * back once the file is open). A receiver that has no use for it ignores the second argument.
 *
 * A multi-file record hands `onFile` its first file; `useHandoffFilesIntake` gets them all.
 *
 * Runs once per mount (`[tool]` deps only, via the `onFile` ref below) - a
 * result that resolves after unmount is dropped rather than calling a
 * callback whose owner is already gone.
 */
export function useHandoffIntake(tool: string, onFile: (file: File, from?: string) => void): void {
  useHandoffFilesIntake(tool, (files, from) => onFile(files[0], from));
}

/** Like `useHandoffIntake`, but hands over every file of the hand-off (a single record gives `[file]`). */
export function useHandoffFilesIntake(tool: string, onFiles: (files: File[], from?: string) => void): void {
  // Keeping only the latest callback in a ref, rather than in the effect's
  // dependency array, is what lets the effect depend on `[tool]` alone -
  // otherwise a tool that recreates its callback every render (as both
  // PdfCompressTool and PdfSplitTool do, since handleFilesAdded closes over
  // render-scoped state) would re-run this effect, and re-collect from a
  // store that already deleted the record, every render.
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    let cancelled = false;
    let cancelRelease = () => {};

    // The pre-paint script held the page back for a hand-off (HERO-02, handoffPending.ts). The
    // storage key is a one-shot and goes as soon as the hand-off is read; the page is released when
    // the tool shows its file, or at once when there is nothing to consume (a stale marker).
    // One key can open two pages (compress: Compress and Compress Image): take only what this page
    // does, and leave the rest for the page it was meant for (handoffKinds.ts).
    const kinds = handoffKindsForPage(tool, location.pathname);
    const taken = kinds ? takeHandoff(tool, (r: HandoffRecord) => handoffFitsPage(r, kinds)) : takeHandoff(tool);
    taken.then((value) => {
      clearHandoffPending(tool);
      if (cancelled) {
        // The hook went away before the read settled: nobody is left to show the file, so
        // the held-back page must not stay hidden.
        releaseHandoffPending();
        return;
      }
      const record = value as HandoffRecord | null;
      const files = record ? filesFromHandoff(record) : [];
      if (files.length === 0) {
        releaseHandoffPending();
        return;
      }
      cancelRelease = releaseHandoffPendingWhenLoaded();
      markHandoffArrival(record?.from);
      onFilesRef.current(files, record?.from);
    });

    return () => {
      cancelled = true;
      cancelRelease();
    };
  }, [tool]);
}
