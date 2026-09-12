import { useEffect, useRef } from 'preact/hooks';
import { useMergeDraft, type UseMergeDraftOptions, type UseMergeDraftResult } from './useMergeDraft.ts';

// MERGE-13: the island loads this through a dynamic import() (same reason
// PageStrip and the preview dialog do, per PdfMergeTool's own comment on
// PageStrip - the eager graph check-page-weight.js measures for /merge/ must
// not grow with a feature only a returning visitor's autosave needs), so it
// has to be a component rather than a bare hook: `import()` resolves to a
// module, and a module's default export is what a caller can render from a
// dynamically-chosen slot without knowing in advance whether the feature
// loaded yet. It renders nothing itself; it only exists to run the hook and
// hand its live state back out through the two callback props below.
export interface MergeDraftPersistenceProps extends UseMergeDraftOptions {
  onStateChange: (state: Pick<UseMergeDraftResult, 'isRestoring' | 'draftSaveState'>) => void;
  /** Called with the hook's clearDraft once, so the island can call it from
   * Clear all / Start again without holding a reference to this component. */
  registerClear: (clear: UseMergeDraftResult['clearDraft']) => void;
}

export default function MergeDraftPersistence({
  onStateChange,
  registerClear,
  ...opts
}: MergeDraftPersistenceProps) {
  const { isRestoring, draftSaveState, clearDraft } = useMergeDraft(opts);

  // registerClear is a one-time handoff, not a subscription: clearDraft
  // itself never changes identity across renders (useMergeDraft.ts's
  // useCallback has no deps), so there is nothing to re-register later.
  const registered = useRef(false);
  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    registerClear(clearDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reported only when either value actually changes, not every render - the
  // island re-renders on every keystroke-equivalent edit, and forwarding an
  // identical { isRestoring, draftSaveState } pair each time would just make
  // its own state updates (and re-renders) needlessly more frequent.
  const lastReported = useRef<{ isRestoring: boolean; draftSaveState: string } | null>(null);
  useEffect(() => {
    if (lastReported.current && lastReported.current.isRestoring === isRestoring && lastReported.current.draftSaveState === draftSaveState) {
      return;
    }
    lastReported.current = { isRestoring, draftSaveState };
    onStateChange({ isRestoring, draftSaveState });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestoring, draftSaveState]);

  return null;
}
