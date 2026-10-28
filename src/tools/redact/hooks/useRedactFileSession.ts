import { useEditorFileSession } from '#editor-ui/hooks/useEditorFileSession.ts';
import { getAppStyle, getEditorPreference } from '#editor/workspace/preferenceStore.ts';
import { isDraftElement } from '#editor/registry/draftValidation.ts';
import type { NeedsUnlockKind } from '#shell/NeedsUnlock.tsx';
import { resolveBrush } from '../components/BrushControls.tsx';
import { resolveWhiteoutColor, resolveRedactBlurStrength } from '../lib/redactStyle.ts';
import { isDirty, type RedactAction, type RedactState } from '../state/redactState.ts';
import type { RedactElement } from '../lib/redactElements.ts';
import { englishRedactMessages as t } from '../messages.ts';

// RED-14: RedactElement itself now lives in redactElements.ts (see its
// own comment there for why it isn't just RedactElement, and why that's also
// what lets useDeleteTool.ts/useLinkedBoxes.ts import it without a cycle).

const REDACT_ELEMENT_TYPES: ReadonlySet<string> = new Set<string>(['whiteout', 'blackout', 'blur', 'delete', 'blurStroke', 'whiteoutStroke']);

function isRedactElement(value: unknown): value is RedactElement {
  return isDraftElement(value) && REDACT_ELEMENT_TYPES.has(value.type);
}

/**
 * The file session (load, add, recents, unique ids, draft, "Open with") is shared
 * with Sign; this is Redact's side of it. `resetForNewFile` clears what belongs to
 * the file just left (the Delete tool's lifts, the Find panel), which live in hooks
 * declared after this one.
 */
export default function useRedactFileSession({ state, dispatch, setAnnouncement, setNeedsUnlock, renderedPageNumbersRef, resetForNewFile }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  setAnnouncement: (message: string) => void;
  setNeedsUnlock: (kind: NeedsUnlockKind | null) => void;
  renderedPageNumbersRef: { current: Set<number> };
  resetForNewFile: () => void;
}) {
  const { file, pdfDocument, status } = state.document;
  // loadPdf.ts reports a coarse status; each one is its own transition here.
  const setLoadStatus = (next: 'loading' | 'editing' | 'error') =>
    dispatch({ type: next === 'loading' ? 'FILE_LOAD_STARTED' : next === 'editing' ? 'FILE_LOADED' : 'FILE_LOAD_FAILED' });

  return useEditorFileSession<RedactElement>({
    tool: 'redact',
    file,
    pdfDocument,
    status,
    setLoadStatus,
    setAnnouncement,
    messages: { invalidPdf: t.invalidPdf, needsPassword: t.needsPassword, ownerRestricted: t.ownerRestricted },
    onNeedsUnlock: setNeedsUnlock,
    initialize: ({ file: selected, preset, restored }) => {
      setNeedsUnlock(null);
      renderedPageNumbersRef.current = new Set();
      // A lift from the last file must never show over this one, and a new file starts clean:
      // RED-39: no tool armed, nothing selected, Find closed with its term.
      resetForNewFile();
      // RED-40: a restored document keeps its own colour and strength.
      const brush = resolveBrush(preset.carried, getAppStyle());
      const color = resolveWhiteoutColor(preset.carried, getAppStyle(), getEditorPreference('lastWhiteoutColor'));
      const strength = resolveRedactBlurStrength(preset.carried, getAppStyle(), getEditorPreference('lastBlurStrength'));
      // A restored draft has no redoable future - future is never persisted.
      dispatch({
        type: 'FILE_INITIALIZED', file: selected, restored, elements: preset.elements || [], past: preset.actionHistory,
        carried: preset.carried, details: preset.details ?? {}, brush, activeColor: color, activeBlurStrength: strength,
      });
    },
    onDocument: (doc, isCurrent) => {
      if (!isCurrent()) return;
      dispatch({ type: 'DOCUMENT_READY', pdfDocument: doc, numPages: doc.numPages });
    },
    draft: {
      elements: state.edits.elements,
      actionHistory: state.edits.history.past,
      carried: state.tool.carried,
      details: state.edits.details,
      isDirty: isDirty(state),
      isElement: isRedactElement,
    },
  });
}
