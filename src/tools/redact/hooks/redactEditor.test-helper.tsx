import { render } from 'preact';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useReducer } from 'preact/hooks';
import { act } from 'preact/test-utils';
import type { DocumentStyle } from '#editor/model/documentStyle.ts';
import { getAppStyle, getEditorPreference } from '#editor/workspace/preferenceStore.ts';
import RedactPages from '../components/RedactPages.tsx';
import RedactToolbar from '../components/RedactToolbar.tsx';
import { resolveBrush } from '../components/BrushControls.tsx';
import { initialRedactStateFromPreferences } from '../lib/initialRedactState.ts';
import type { RedactElement } from '../lib/redactElements.ts';
import { resolveRedactBlurStrength, resolveWhiteoutColor } from '../lib/redactStyle.ts';
import { canRedo, redactReducer, type RedactAction, type RedactState } from '../state/redactState.ts';
import useRedactEditor, { type RedactEditor } from './useRedactEditor.ts';
import useRedactPages from './useRedactPages.ts';

/** @testSeam */
export interface MountedRedactEditor {
  state: () => RedactState;
  editor: () => RedactEditor;
  dispatch: (action: RedactAction) => void;
  announcement: () => string;
  root: HTMLElement;
  unmount: () => void;
}

/**
 * The island's editing side over the real reducer, with no pdf.js: the file is opened with
 * FILE_INITIALIZED and pdfDocument stays null, then `numPages` pages are laid out by the real
 * useRedactPages. The host is attached to document.body, because Escape, click-outside and Peek keys
 * are window and document listeners. `render: true` also renders the real page column and toolbar.
 * `styles` is the document's own carried style, as a restored draft brings it.
 *
 * @testSeam
 */
export function mountRedactEditor({ numPages = 1, elements = [], fileBytes = null, styles, render: draw = false }: {
  numPages?: number;
  elements?: RedactElement[];
  fileBytes?: ArrayBuffer | null;
  styles?: Partial<DocumentStyle>;
  render?: boolean;
} = {}): MountedRedactEditor {
  const root = document.createElement('div');
  document.body.appendChild(root);
  let current!: { state: RedactState; editor: RedactEditor; dispatch: (action: RedactAction) => void };

  function Harness() {
    const [state, dispatch] = useReducer(redactReducer, undefined, initialRedactStateFromPreferences);
    const setAnnouncement = (message: string) => dispatch({ type: 'ANNOUNCED', message });
    const pages = useRedactPages({ state, dispatch });
    const editor = useRedactEditor({ state, dispatch, setAnnouncement, fileBytes, pages });
    current = { state, editor, dispatch };
    if (!draw) return null;
    const { arming, editing, findKit } = editor;
    return (
      <>
        <RedactToolbar
          tool={{ active: state.tool.activeStyle, locked: state.tool.toolLocked, set: arming.setTool, brushMode: arming.brushKind !== null }}
          announce={setAnnouncement}
          fullscreen={{ active: pages.isFullscreenActive, toggle: pages.toggleFullscreen }}
          output={{ download: () => {}, prepareShare: () => {}, share: () => {} }}
          history={{ entries: state.edits.history.past, undo: editing.undoLast, redo: editing.redoLast, canRedo: canRedo(state) }}
          undoChip={{ action: state.edits.undoAction, run: editing.runUndoChip }}
          elementsCount={state.edits.elements.length}
          peek={{ active: arming.peekAll, onChange: arming.setPeekAll }}
        />
        <RedactPages state={state} dispatch={dispatch} pages={pages} arming={arming} editing={editing} findKit={findKit} />
      </>
    );
  }

  act(() => render(<Harness />, root));
  const file = new File([new Uint8Array(0)], 'doc.pdf', { type: 'application/pdf' });
  act(() => {
    current.dispatch({
      type: 'FILE_INITIALIZED', file, restored: false, elements, past: [], carried: styles, details: {},
      brush: resolveBrush(styles, getAppStyle()),
      activeColor: resolveWhiteoutColor(styles, getAppStyle(), getEditorPreference('lastWhiteoutColor')),
      activeBlurStrength: resolveRedactBlurStrength(styles, getAppStyle(), getEditorPreference('lastBlurStrength')),
    });
    // forced: DOCUMENT_READY is the only action that sets numPages, and it wants a pdf.js document; the pages draw nothing without one
    current.dispatch({ type: 'DOCUMENT_READY', pdfDocument: null as unknown as PDFDocumentProxy, numPages });
    current.dispatch({ type: 'FILE_LOADED' });
  });

  return {
    state: () => current.state,
    editor: () => current.editor,
    dispatch: (action) => act(() => current.dispatch(action)),
    announcement: () => current.state.view.announcement,
    root,
    unmount: () => {
      act(() => render(null, root));
      root.remove();
    },
  };
}
