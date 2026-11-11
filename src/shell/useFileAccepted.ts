import { useEffect, useRef } from 'preact/hooks';
import { reportToolLifecycleEvent, type AnalyticsTool } from '#lib/telemetry/productAnalytics.ts';
import { markFileOpened } from '#lib/appUpdate/engagement.ts';

interface FileAcceptedInput {
  analyticsTool: AnalyticsTool | undefined;
  hasFiles: boolean;
  file: File | null;
  multiple: boolean;
}

/** Marks the device as having opened a file, and reports `tool_file_accepted` on first files or a single-file replacement. */
export function useFileAccepted({ analyticsTool, hasFiles, file, multiple }: FileAcceptedInput): void {
  const previouslyHadFilesRef = useRef(false);
  const previousFileRef = useRef<File | null>(null);

  useEffect(() => {
    // MEM-39: a file in front of the person (picked, dropped, handed over, or
    // restored from a draft) is what starts the offline install. Idempotent,
    // and before the analytics guard: it does not depend on a tool being named.
    if (hasFiles) markFileOpened();
    if (!analyticsTool) return;
    // A replacement keeps hasFiles true, so a single-file tool's new `file` is the signal.
    const replaced = hasFiles && previouslyHadFilesRef.current && !multiple
      && file !== null && previousFileRef.current !== null && file !== previousFileRef.current;
    if ((hasFiles && !previouslyHadFilesRef.current) || replaced) {
      reportToolLifecycleEvent('tool_file_accepted', analyticsTool);
    }
    previouslyHadFilesRef.current = hasFiles;
    previousFileRef.current = file;
  }, [analyticsTool, hasFiles, file, multiple]);
}
