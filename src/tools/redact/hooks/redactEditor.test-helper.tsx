import { render } from 'preact';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import '../../../test/support/realPdfjs.ts';
import { buildPdf } from '../../../test/support/redactCheckPdfs.test-helper.ts';
import { useReducer } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterAll } from 'vitest';
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

// One real three-page file, opened once by the shipped pdf.js; every mount shares it (a mount is synchronous,
// a document opens asynchronously, and no test here asks for more than three pages).
const sharedTask = (await getPdfjs()).getDocument({ data: await buildPdf([{ lines: ['one'] }, { lines: ['two'] }, { lines: ['three'] }]), wasmUrl: PDFJS_WASM_URL });
const sharedDocument = await sharedTask.promise;
afterAll(() => sharedTask.destroy());

/**
 * The island's editing side over the real reducer: the file is opened with FILE_INITIALIZED, the shared
 * real pdf.js document is handed over with DOCUMENT_READY, then `numPages` pages are laid out by the real
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
  if (numPages > sharedDocument.numPages) throw new Error(`the shared document has ${sharedDocument.numPages} pages, not ${numPages}`);
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
    current.dispatch({ type: 'DOCUMENT_READY', pdfDocument: sharedDocument, numPages });
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
