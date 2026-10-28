import type { RedactAction, RedactState } from '../state/redactState.ts';
import type { RedactArming } from '../hooks/useRedactArming.ts';
import type { RedactEditing } from '../hooks/useRedactEditing.ts';
import type { RedactPages as RedactPagesHook } from '../hooks/useRedactPages.ts';
import type { RedactFind } from '../hooks/useRedactFind.ts';
import workspaceStyles from '#editor-ui/Workspace.module.css';
import RedactPage from './RedactPage.tsx';

/** The column of page cards, with the tap-outside handlers a phone needs to let go of a selection. */
export default function RedactPages({ state, dispatch, pages, arming, editing, findKit }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  pages: RedactPagesHook;
  arming: RedactArming;
  editing: RedactEditing;
  findKit: RedactFind;
}) {
  const { tapOutside } = pages;
  return (
    <div
      className={workspaceStyles['pages-container']}
      onTouchStart={tapOutside.onTouchStart}
      onTouchEnd={tapOutside.onTouchEnd}
      onTouchCancel={tapOutside.onTouchCancel}
    >
      {Array.from({ length: state.document.numPages }).map((_, i) => (
        <RedactPage key={i} index={i} state={state} dispatch={dispatch} pages={pages} arming={arming} editing={editing} findKit={findKit} />
      ))}
    </div>
  );
}
