import { useEffect, useRef } from 'preact/hooks';
import { saveDraft, loadDraft, deleteDraft } from './draftStore.js';

/**
 * Wires crash-safe draft persistence into a PDF editing tool.
 *
 * Continuous debounced autosave — not `beforeunload` — is what actually survives a
 * crash, since a crashing tab fires no unload event. The visibility/pagehide flush is
 * only a best-effort catch-up for clean closes.
 *
 * @param {object} opts
 * @param {string}  opts.tool       - 'sign' | 'redact'
 * @param {boolean} opts.enabled    - master switch
 * @param {File?}   opts.file        - currently loaded file (fingerprint/display)
 * @param {ArrayBuffer?} opts.fileBytes - source PDF bytes, captured once at load
 * @param {Array}   opts.elements   - JSON-serializable edit state
 * @param {object}  opts.extra      - tool-specific extra state (e.g. { actionHistory })
 * @param {string}  opts.status     - tool status; only 'editing' persists
 * @param {() => Promise<boolean>} [opts.beforeRestore] - runs first on mount; return
 *   true to claim the load (a pending home-page handoff) and skip the draft restore
 * @param {(record: object) => void} opts.onRestore - rehydrate the tool from a draft
 * @returns {{ clearDraft: () => Promise<void> }}
 */
export function useDraftPersistence({
  tool,
  enabled = true,
  file,
  fileBytes,
  elements,
  extra,
  status,
  beforeRestore,
  onRestore
}) {
  // Restore runs exactly once per mount, before any autosave can fire.
  const restoreAttempted = useRef(false);
  // Keep the latest values addressable from event listeners without re-binding them.
  const latest = useRef({});
  latest.current = { tool, enabled, file, fileBytes, elements, extra, status };

  const buildRecord = () => {
    const { file, fileBytes, elements, extra } = latest.current;
    if (!file || !fileBytes) return null;
    return {
      fileName: file.name,
      fileSize: file.size,
      fileLastModified: file.lastModified,
      fileType: file.type || 'application/pdf',
      fileBytes,
      elements: elements || [],
      extra: extra || {}
    };
  };

  // Restore on mount.
  useEffect(() => {
    if (!enabled || restoreAttempted.current) return;
    restoreAttempted.current = true;
    let cancelled = false;
    (async () => {
      // Sequenced, not raced: whoever resolves first would otherwise claim the
      // load by timing alone. See useEditorDraftPersistence's beforeRestore.
      if (beforeRestore && (await beforeRestore())) return;
      if (cancelled) return;
      const record = await loadDraft(tool);
      if (cancelled) return;
      if (record && record.fileBytes) {
        onRestore(record);
      } else {
        // No draft to restore after all. draftStore already clears the
        // localStorage hint for next time; this clears the *live* DOM
        // attribute the blocking head script set from that hint before this
        // component ever mounted, so a stale hint doesn't leave the hero
        // pre-collapsed above an empty dropzone with nothing to explain it.
        document.documentElement?.removeAttribute('data-draft-hint');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave on edit-state changes while editing.
  useEffect(() => {
    if (!enabled || status !== 'editing' || !file || !fileBytes) return;
    const timer = setTimeout(() => {
      const record = buildRecord();
      if (record) saveDraft(tool, record);
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tool, status, file, fileBytes, elements, extra]);

  // Best-effort immediate flush when the tab is hidden or being unloaded.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      const { status } = latest.current;
      if (status !== 'editing') return;
      const record = buildRecord();
      if (record) saveDraft(tool, record);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tool]);

  const clearDraft = () => deleteDraft(tool);

  return { clearDraft };
}
