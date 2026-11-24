import type { RedactAction, RedactState } from '../state/redactState.ts';
import useRedactArming from './useRedactArming.ts';
import useRedactEditing from './useRedactEditing.ts';
import useRedactFind from './useRedactFind.ts';
import type { RedactPages } from './useRedactPages.ts';

/**
 * The editing side of the island: what is armed, everything that changes the
 * boxes, and find. `resetForNewFile` clears what belongs to the file just
 * replaced. The page column (`pages`) and the file's bytes come in because the
 * file session needs the pages before the bytes exist.
 */
export default function useRedactEditor({ state, dispatch, setAnnouncement, fileBytes, pages }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  setAnnouncement: (message: string) => void;
  fileBytes: ArrayBuffer | null;
  pages: RedactPages;
}) {
  // activeStyle is null | 'delete' | 'blackout' | 'blur' | 'whiteout'. Null -
  // nothing armed - is the resting state, exactly as it is in the Sign tool: a
  // tool arms for one box and disarms itself once that box is committed, unless
  // it has been locked on. Before this the tool was permanently armed (it even
  // started on Delete), so there was no state in which a drag on the document
  // meant anything but "draw a box" - which on a phone meant the page could not
  // be scrolled.
  const arming = useRedactArming({ state, dispatch });
  const editing = useRedactEditing({
    state, dispatch, setAnnouncement, fileBytes, pageWrapperRefs: pages.pageWrapperRefs,
    samplePage: pages.samplePage, arming,
  });
  const findKit = useRedactFind({ state, setAnnouncement, commands: editing.commands, brushArmed: arming.brushKind !== null });

  const resetForNewFile = () => {
    editing.deleteTool.clearLifts();
    findKit.find.setOpen(false);
    findKit.find.setTerm('');
    findKit.find.setPreset(null);
  };

  return { arming, editing, findKit, resetForNewFile };
}

export type RedactEditor = ReturnType<typeof useRedactEditor>;
