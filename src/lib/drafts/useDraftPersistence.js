import { useEffect, useRef, useState } from 'preact/hooks';
import { saveDraft, loadDraft, deleteDraft, hasDraftHint, subscribeToDraftChanges, attachDraftPreview, cacheRecentFile, isStoragePersisted } from './draftStore.js';
import { DRAFT_SCHEMA_VERSION } from './draftPolicy.js';

// The unpersisted-warning line is scoped to an installed/home-screen app, not
// every browser tab. This is a deliberate anti-noise decision, not the
// simplest thing to check: browsers differ on what `persisted()` reports
// after an un-granted request (Chrome commonly answers `false` for an
// ordinary tab while still keeping that tab's storage reliably in practice),
// so warning on every `false` would train people to stop reading the line.
// An installed app is exactly where this shipped from - the reported loss
// was from an installed iOS home-screen app - and it is where a person is
// most likely to treat "Draft saved" as a durable promise, so it is where
// the warning earns its keep. The cost: an ordinary browser tab whose storage
// is also technically unpersisted, and could in principle be evicted, never
// sees the line. That trade is deliberate - see SIGN-06/the persistence
// ticket's report for the reasoning.
function isInstalledStandalone() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) return true;
    // iOS Safari never matches the media query above, even once installed; it
    // exposes this legacy boolean on `navigator` instead.
    return typeof navigator !== 'undefined' && navigator.standalone === true;
  } catch {
    return false;
  }
}

// Clears the blocking head script's DOM hint once a real restore check has
// settled with nothing to restore. Shared by both "no record at all" and
// "record present but invalid" - see useEditorDraftPersistence's onRestore.
export function clearDraftHintAttribute() {
  document.documentElement?.removeAttribute('data-draft-hint');
  document.documentElement?.removeAttribute('data-editor-restore');
}

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
 * @param {boolean} opts.isDirty    - whether the current document differs from
 *   the baseline established by its loader. Opening and restoring establish a
 *   clean baseline; only a real editor operation may make this true.
 * @param {() => Promise<boolean>} [opts.beforeRestore] - runs first on mount; return
 *   true to claim the load (a pending home-page handoff) and skip the draft restore
 * @param {(record: object) => void} opts.onRestore - rehydrate the tool from a draft
 * @returns {{ clearDraft: () => Promise<void>, isRestoring: boolean,
 *   draftSaveState: 'idle'|'pending'|'saved'|'error'|'conflict'|'unpersisted', draftSaveRevision: number }}
 *   `draftSaveState` describes the current revision only. In particular, a
 *   scheduled or failed write is never reported as saved. `'unpersisted'` is
 *   `'saved'` with one extra fact attached - this browser has not guaranteed
 *   it will keep what was just saved - and only ever replaces a `'saved'` of
 *   the current revision; it can never appear before a save has actually
 *   succeeded, and a later `'error'`/`'conflict'` always wins over it.
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
  isDirty = false,
  beforeRestore,
  onRestore
}) {
  // Restore runs exactly once per mount, before any autosave can fire.
  const restoreAttempted = useRef(false);
  // Keep the latest values addressable from event listeners without re-binding them.
  const latest = useRef({});
  latest.current = { tool, enabled, file, fileBytes, elements, extra, status, isDirty };

  // Each distinct editor snapshot gets a monotonically increasing revision.
  // IndexedDB writes cannot be cancelled once started, so completions must prove
  // they still belong to the live snapshot before changing the visible state.
  const revisionRef = useRef(0);
  const sourceRef = useRef(null);
  const source = { tool, enabled, file, fileBytes, elements, extra, status, isDirty };
  const sourceChanged = !sourceRef.current || Object.keys(source).some(
    (key) => sourceRef.current[key] !== source[key],
  );
  if (sourceChanged) {
    sourceRef.current = source;
    revisionRef.current += 1;
  }
  const currentRevision = revisionRef.current;
  const [saveState, setSaveState] = useState({ state: 'idle', revision: 0 });
  // Set at most once per mount, and only once a save has actually succeeded -
  // see the effect below and isInstalledStandalone's comment for the
  // anti-noise scoping.
  const [notPersisted, setNotPersisted] = useState(false);
  const persistenceCheckedRef = useRef(false);
  const writePromisesRef = useRef(new Map());
  // A debounce can still fire after pagehide has flushed that same revision.
  // Remember successful revisions so one edit produces one write, while a
  // failed attempt remains eligible for the later debounce/event retry.
  const savedRevisionsRef = useRef(new Set());
  const [isRestoring, setIsRestoring] = useState(() => enabled && hasDraftHint(tool));

  // A storage event never fires in the writer tab, only in its peers. Do not
  // silently replace the document a person is actively editing: surface the
  // deterministic policy instead. Their next save becomes the newer revision
  // and wins; replacing the file remains an explicit user action.
  useEffect(() => {
    if (!enabled) return;
    return subscribeToDraftChanges(tool, () => {
      if (latest.current.status === 'editing' && latest.current.file && latest.current.isDirty) {
        setSaveState({ state: 'conflict', revision: revisionRef.current });
      }
    });
  }, [enabled, tool]);

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
      preview: previewRef.current || undefined,
      schemaVersion: DRAFT_SCHEMA_VERSION
    };
  };

  const persist = (revision, record) => {
    if (writePromisesRef.current.has(revision)) {
      return writePromisesRef.current.get(revision);
    }
    if (savedRevisionsRef.current.has(revision)) {
      return Promise.resolve(true);
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
          // The preview may finish during the debounce, after record was
          // captured but before its metadata is written. Reattach after the
          // successful save so that stale snapshot cannot erase the image.
          if (saved && previewRef.current) attachDraftPreview(tool, previewRef.current);
          setSaveState({ state: saved ? 'saved' : 'error', revision });
        }
        if (saved) savedRevisionsRef.current.add(revision);
        return saved;
      })
      .finally(() => {
        writePromisesRef.current.delete(revision);
      });
    writePromisesRef.current.set(revision, write);
    return write;
  };

  // SIGN-06 follow-up: once a save has actually succeeded, ask (once) whether
  // this origin's storage is really persistent. Gated on `saveState.state ===
  // 'saved'` so the check - and therefore the line it can turn on - can never
  // run before a save has succeeded; `draftSaveState`'s own derivation below
  // is a second, independent guard against showing it any earlier.
  useEffect(() => {
    if (!enabled || persistenceCheckedRef.current || saveState.state !== 'saved') return;
    persistenceCheckedRef.current = true;
    if (!isInstalledStandalone()) return;
    let cancelled = false;
    isStoragePersisted().then((persisted) => {
      // Only a definite `false` counts. `'unknown'` (no Storage API, a throw,
      // a rejection) is not evidence of anything and must not cry wolf over a
      // browser that simply cannot answer.
      if (!cancelled && persisted === false) setNotPersisted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, saveState.state]);

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
        clearDraftHintAttribute();
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
  // and the next one (700ms later, at the next edit) carries it - or, if the
  // visitor changes nothing more, attachDraftPreview below writes it straight
  // into the hint instead. Without that second path a document that was opened
  // and then left alone kept a resume card with no thumbnail for as long as the
  // draft lived, because the preview only ever reached storage as a side effect
  // of saving again.
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
        if (cancelled) return;
        previewRef.current = dataUrl;
        // The cache write upgrades the source entry with a thumbnail once it
        // is ready. It is independent of autosave, so merely opening a PDF is
        // enough for it to appear among the home page's recent files.
        if (fileBytes) void cacheRecentFile(tool, {
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileBytes,
          preview: dataUrl,
        });
        // Only lands if a draft hint already exists, so this cannot invent
        // metadata for a document that was never saved or has since gone.
        attachDraftPreview(tool, dataUrl);
      })
      .catch(() => {
        // A preview is decoration. An encrypted or malformed PDF that pdf.js
        // refuses must not take the draft down with it.
      });
    return () => {
      cancelled = true;
    };
    // `tool` is a literal per mounted editor and never changes, so listing it
    // costs no extra runs; it is here because attachDraftPreview reads it.
  }, [enabled, file, tool]);

  // Debounced autosave on edit-state changes while editing.
  useEffect(() => {
    if (!enabled || status !== 'editing' || !file || !fileBytes || !isDirty) return;
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
  }, [enabled, tool, status, file, fileBytes, elements, extra, isDirty, currentRevision]);

  // Best-effort immediate flush when the tab is hidden or being unloaded.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      const { status } = latest.current;
      if (status !== 'editing' || !latest.current.isDirty) return;
      const revision = revisionRef.current;
      // A successful debounce already persisted this exact snapshot. Hiding
      // or leaving the page must not turn its settled "saved" state back into
      // a permanent "pending" state just because persist() can dedupe it.
      if (savedRevisionsRef.current.has(revision)) return;
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

  // MEM-01/02: `deleteDraft` clears only this tool's work on the entry it is
  // currently pointed at, then drops the pointer - the entry itself, its
  // bytes, and every *other* tool's work on it stay in recents. An ordinary
  // file replacement never calls this at all: loadPdf.ts's `loadPdf` moves
  // straight to the new file and lets `cacheRecentFile`/`saveDraft` point the
  // tool at the new entry, leaving the outgoing entry exactly as it was. The
  // one caller of `clearDraft` is loadPdf.ts's `restored && (fail | timeout)`
  // path: a restored draft that turned out unusable, where dropping this
  // tool's own broken work (and the pointer to it) is the right outcome.
  const clearDraft = async () => {
    // Invalidate any in-flight completion from the outgoing snapshot
    // immediately, so a save that was already on the wire cannot resurrect
    // what this call just cleared.
    revisionRef.current += 1;
    try {
      return await deleteDraft(tool);
    } finally {
      clearDraftHintAttribute();
    }
  };

  const canPersist = enabled && status === 'editing' && !!file && !!fileBytes && isDirty;
  // sourceChanged runs during render, before an old promise can paint its
  // completion. Derive pending for the new snapshot until its effect records
  // the same state, so there is no transient stale "Draft saved" chip.
  // `notPersisted` only ever swaps in for a *current* 'saved' - never for
  // 'idle'/'pending' (so the warning cannot appear before a save has
  // succeeded) and never over 'error'/'conflict' (which fall through
  // untouched, so they keep outranking it as the more urgent state).
  const draftSaveState = saveState.state === 'conflict'
    ? 'conflict'
    : saveState.revision === currentRevision
    ? (saveState.state === 'saved' && notPersisted ? 'unpersisted' : saveState.state)
    : (canPersist ? 'pending' : 'idle');

  return { clearDraft, isRestoring, draftSaveState, draftSaveRevision: currentRevision };
}
