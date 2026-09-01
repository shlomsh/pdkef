import { useEffect, useRef, useState } from 'preact/hooks';
import { saveDraft, loadDraft, deleteDraft, hasDraftHint } from '../../editor/workspace/draftStore.js';

// Upper bound on how long the mount-time restore check may hold the caller in
// `isRestoring` before giving up. A real IndexedDB open+read is normally
// single-digit milliseconds; this exists only to protect against a genuinely
// stuck transaction turning a brief loading state into one that never
// resolves. It does not cancel the underlying check - a late result still
// gets applied (see the restore effect below) - it only stops the caller from
// blocking its empty state on it forever.
export const RESTORE_TIMEOUT_MS = 4000;

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
 * @returns {{ clearDraft: () => Promise<void>, isRestoring: boolean,
 *   draftSaveState: 'idle'|'pending'|'saved'|'error', draftSaveRevision: number }}
 *   `draftSaveState` describes the current revision only. In particular, a
 *   scheduled or failed write is never reported as saved.
 *   starts true only when draftStore's synchronous hint (hasDraftHint) says a
 *   draft is likely, and flips false once the real restore settles or
 *   RESTORE_TIMEOUT_MS elapses - the caller's cue to hold off on an empty state
 *   that a file is about to replace anyway. A visitor with no hint never enters
 *   this state at all, so a plain first visit is exactly as fast as before. See
 *   BasePdfTool.tsx's `checkingDraft` prop.
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

  // Each distinct editor snapshot gets a monotonically increasing revision.
  // IndexedDB writes cannot be cancelled once started, so completions must prove
  // they still belong to the live snapshot before changing the visible state.
  const revisionRef = useRef(0);
  const sourceRef = useRef(null);
  const source = { tool, enabled, file, fileBytes, elements, extra, status };
  const sourceChanged = !sourceRef.current || Object.keys(source).some(
    (key) => sourceRef.current[key] !== source[key],
  );
  if (sourceChanged) {
    sourceRef.current = source;
    revisionRef.current += 1;
  }
  const currentRevision = revisionRef.current;
  const [saveState, setSaveState] = useState({ state: 'idle', revision: 0 });
  const writePromisesRef = useRef(new Map());

  const [isRestoring, setIsRestoring] = useState(() => enabled && hasDraftHint(tool));

  // Page-1 preview for the home page's resume card, rendered once per loaded
  // file and reused by every save after it. Autosave fires on a 700ms debounce
  // while typing, so rendering this inside buildRecord would re-rasterize a
  // PDF page every few keystrokes to produce a byte-identical image.
  const previewRef = useRef(null);

  const buildRecord = (values = latest.current) => {
    const { file, fileBytes, elements, extra } = values;
    if (!file || !fileBytes) return null;
    return {
      fileName: file.name,
      fileSize: file.size,
      fileLastModified: file.lastModified,
      fileType: file.type || 'application/pdf',
      fileBytes,
      elements: elements || [],
      extra: extra || {},
      preview: previewRef.current || undefined
    };
  };

  const persist = (revision, record) => {
    if (writePromisesRef.current.has(revision)) {
      return writePromisesRef.current.get(revision);
    }
    const write = Promise.resolve()
      .then(() => saveDraft(tool, record))
      .then((saved) => saved === true)
      .catch(() => false)
      .then((saved) => {
        // A prior file or edit may have completed after this write started.
        // It remains stored as a best-effort older revision, but must not make
        // the newer editor state claim it has been saved.
        if (revision === revisionRef.current) {
          setSaveState({ state: saved ? 'saved' : 'error', revision });
        }
        return saved;
      })
      .finally(() => {
        writePromisesRef.current.delete(revision);
      });
    writePromisesRef.current.set(revision, write);
    return write;
  };

  // Restore on mount.
  useEffect(() => {
    if (!enabled || restoreAttempted.current) {
      setIsRestoring(false);
      return;
    }
    restoreAttempted.current = true;
    let cancelled = false;
    // Only ever moves isRestoring from true to false, so a late timeout firing
    // after the real check already settled (or vice versa) is a harmless no-op.
    const stopWaiting = () => {
      if (!cancelled) setIsRestoring(false);
    };
    const timeoutId = setTimeout(stopWaiting, RESTORE_TIMEOUT_MS);
    (async () => {
      // Sequenced, not raced: whoever resolves first would otherwise claim the
      // load by timing alone. See useEditorDraftPersistence's beforeRestore.
      if (beforeRestore && (await beforeRestore())) {
        if (cancelled) return;
        clearTimeout(timeoutId);
        stopWaiting();
        return;
      }
      if (cancelled) return;
      const record = await loadDraft(tool);
      if (cancelled) return;
      clearTimeout(timeoutId);
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
      stopWaiting();
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the resume-card preview when the loaded file changes. Deliberately
  // fire-and-forget: it dynamically imports pdf.js, so it must never sit in
  // front of the first autosave. A save that beats it just writes no preview,
  // and the next one (700ms later, at the next edit) carries it.
  useEffect(() => {
    previewRef.current = null;
    if (!enabled || !file) return;
    // Re-fires on a restored draft too, since `file` is a fresh File rebuilt
    // from the record either way (see useEditorDraftPersistence's fileFrom) -
    // one redundant rasterization of a page the record may already have a
    // preview for. Deduping would mean threading "this file came from a
    // restore" through this hook's params just to save one decode; not worth
    // it against the restore path staying this thin.
    let cancelled = false;
    import('../../lib/thumbnails.js')
      .then(({ renderDraftPreview }) => renderDraftPreview(file))
      .then((dataUrl) => {
        if (!cancelled) previewRef.current = dataUrl;
      })
      .catch(() => {
        // A preview is decoration. An encrypted or malformed PDF that pdf.js
        // refuses must not take the draft down with it.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, file]);

  // Debounced autosave on edit-state changes while editing.
  useEffect(() => {
    if (!enabled || status !== 'editing' || !file || !fileBytes) return;
    const revision = currentRevision;
    // Capture the rendered values. Reading `latest` when the debounce fires
    // would let an old timer write a newer edit under the wrong revision.
    const record = buildRecord(source);
    if (!record) return;
    setSaveState({ state: 'pending', revision });
    const timer = setTimeout(() => {
      persist(revision, record);
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tool, status, file, fileBytes, elements, extra, currentRevision]);

  // Best-effort immediate flush when the tab is hidden or being unloaded.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      const { status } = latest.current;
      if (status !== 'editing') return;
      const revision = revisionRef.current;
      const record = buildRecord();
      if (record) {
        setSaveState({ state: 'pending', revision });
        persist(revision, record);
      }
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

  const clearDraft = () => {
    // A replacement clears the stored record while its next file is still
    // loading. Invalidate any completion from the outgoing file immediately.
    revisionRef.current += 1;
    return deleteDraft(tool);
  };

  const canPersist = enabled && status === 'editing' && !!file && !!fileBytes;
  // sourceChanged runs during render, before an old promise can paint its
  // completion. Derive pending for the new snapshot until its effect records
  // the same state, so there is no transient stale "Draft saved" chip.
  const draftSaveState = saveState.revision === currentRevision
    ? saveState.state
    : (canPersist ? 'pending' : 'idle');

  return { clearDraft, isRestoring, draftSaveState, draftSaveRevision: currentRevision };
}
