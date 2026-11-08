// @ts-check
import { useEffect, useRef, useState } from 'preact/hooks';
import { saveDraft, loadDraft, deleteDraft, attachDraftPreview, cacheRecentFile, isStoragePersisted } from './draftStore.ts';
import { useDraftRestore, useDraftSave, clearDraftHintAttribute } from './useDraftLifecycle.ts';
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
    return typeof navigator !== 'undefined' && /** @type {{ standalone?: boolean }} */ (navigator).standalone === true;
  } catch {
    // expected: feature detect, no standalone mode available
    return false;
  }
}

export { clearDraftHintAttribute } from './useDraftLifecycle.ts';

/**
 * @typedef {object} EditorSnapshot
 * @property {string} tool
 * @property {boolean} enabled
 * @property {File | null} file
 * @property {ArrayBuffer | null} fileBytes
 * @property {unknown[]} elements
 * @property {object} extra
 * @property {string} status
 * @property {boolean} isDirty
 */

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
 * @param {unknown[]}   opts.elements   - JSON-serializable edit state
 * @param {object}  opts.extra      - tool-specific extra state (e.g. { actionHistory })
 * @param {string}  opts.status     - tool status; only 'editing' persists
 * @param {boolean} opts.isDirty    - whether the current document differs from
 *   the baseline established by its loader. Opening and restoring establish a
 *   clean baseline; only a real editor operation may make this true.
 * @param {() => Promise<boolean>} [opts.beforeRestore] - runs first on mount; return
 *   true to claim the load (a pending home-page handoff) and skip the draft restore
 * @param {(record: object, source: 'restore' | 'recent') => void} opts.onRestore - rehydrate the tool from a draft;
 *   `source` says whether a recent tile asked for it (DEBT-58), for the tool to mark if it applies the restore
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
 *   BasePdfTool.tsx's `checkingDraft` prop. `clearDraft` also resolves a boolean; the
 *   contract stays Promise<void>, hence the cast at the return.
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
  // Keep the latest values addressable from the save core's build without re-binding anything.
  const latest = useRef(/** @type {EditorSnapshot} */ ({}));
  latest.current = { tool, enabled, file, fileBytes, elements, extra, status, isDirty };

  // Page-1 preview for the home page's resume card, rendered once per loaded
  // file and reused by every save after it. Autosave fires on a 700ms debounce
  // while typing, so rendering this inside buildRecord would re-rasterize a
  // PDF page every few keystrokes to produce a byte-identical image.
  const previewRef = useRef(/** @type {string | null} */ (null));

  const buildRecord = (/** @type {EditorSnapshot} */ values) => {
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

  const canSave = enabled && status === 'editing' && !!file && !!fileBytes && isDirty;
  const save = useDraftSave({
    tool,
    enabled,
    snapshot: [tool, enabled, file, fileBytes, elements, extra, status, isDirty],
    canSave,
    build: () => buildRecord(latest.current),
    write: async (record, isCurrent) => {
      const saved = (await saveDraft(tool, record)) === true;
      // A preview that finished after the record was built is reattached once saved,
      // only while this snapshot is live: a late save must not take another file's preview.
      if (saved && isCurrent() && previewRef.current) attachDraftPreview(tool, previewRef.current);
      return saved;
    },
    errorStep: 'autosave_draft',
    watchConflicts: true
  });

  // Set at most once per mount, and only once a save has actually succeeded -
  // see the effect below and isInstalledStandalone's comment for the
  // anti-noise scoping.
  const [notPersisted, setNotPersisted] = useState(false);
  const persistenceCheckedRef = useRef(false);

  const { checking: isRestoring } = useDraftRestore({
    tool,
    enabled,
    run: async (source, isCancelled) => {
      // Sequenced, not raced: whoever resolves first would otherwise claim the
      // load by timing alone. See useEditorDraftPersistence's beforeRestore.
      if (beforeRestore && (await beforeRestore())) return true;
      const record = await loadDraft(tool);
      if (isCancelled()) return true;
      if (record && record.fileBytes) {
        onRestore(record, source);
        return true;
      }
      return false;
    }
  });

  // SIGN-06 follow-up: once a save has actually succeeded, ask (once) whether
  // this origin's storage is really persistent. Gated on `save.state ===
  // 'saved'` so the check - and therefore the line it can turn on - can never
  // run before a save has succeeded; `draftSaveState`'s own derivation below
  // is a second, independent guard against showing it any earlier.
  useEffect(() => {
    if (!enabled || persistenceCheckedRef.current || save.state !== 'saved') return;
    persistenceCheckedRef.current = true;
    if (!isInstalledStandalone()) return;
    let cancelled = false;
    void isStoragePersisted().then((persisted) => { // reason: isStoragePersisted resolves "unknown" instead of rejecting
      // Only a definite `false` counts. `'unknown'` (no Storage API, a throw,
      // a rejection) is not evidence of anything and must not cry wolf over a
      // browser that simply cannot answer.
      if (!cancelled && persisted === false) setNotPersisted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, save.state]);

  // Render the resume-card preview when the loaded file changes. Deliberately
  // fire-and-forget: it dynamically imports pdf.js, so it must never sit in
  // front of the first autosave. A save that beats it just writes no preview,
  // and the next one (700ms later, at the next edit) carries it - or, if the
  // visitor changes nothing more, cacheRecentFile below writes it straight
  // into this file's row instead. Without that second path a document that was opened
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
    import('../pdf/thumbnails.js')
      .then(({ renderDraftPreview }) => renderDraftPreview(file))
      .then((dataUrl) => {
        if (cancelled) return;
        previewRef.current = dataUrl;
        // The cache write upgrades the source entry with a thumbnail once it
        // is ready. It is independent of autosave, so merely opening a PDF is
        // enough for it to appear among the home page's recent files. It
        // keys the preview by this file's own content hash. Never follow it
        // with attachDraftPreview here: that writes to whatever entry the
        // pointer names, and cacheRecentFile only moves the pointer to this
        // file once it has hashed and stored it, so the previous file's tile
        // took this file's thumbnail (MEM-14).
        if (fileBytes) void cacheRecentFile(tool, { // reason: cacheRecentFile reports its own store failure
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileBytes,
          preview: dataUrl,
        });
      })
      .catch(() => {
        // expected: A preview is decoration. An encrypted or malformed PDF that pdf.js
        // refuses must not take the draft down with it.
      });
    return () => {
      cancelled = true;
    };
    // `tool` is a literal per mounted editor and never changes, so listing it
    // costs no extra runs; it is here because cacheRecentFile reads it.
  }, [enabled, file, tool]);

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
    save.invalidate();
    try {
      return await deleteDraft(tool);
    } finally {
      clearDraftHintAttribute();
    }
  };

  // `notPersisted` only ever swaps in for a 'saved' - never for
  // 'idle'/'pending' (so the warning cannot appear before a save has
  // succeeded) and never over 'error'/'conflict' (which keep outranking it).
  const draftSaveState = save.state === 'saved' && notPersisted ? 'unpersisted' : save.state;

  return { clearDraft: /** @type {() => Promise<void>} */ (/** @type {unknown} */ (clearDraft)), isRestoring, draftSaveState, draftSaveRevision: save.revision };
}
