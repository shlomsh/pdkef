import type { RedactElement } from '../lib/redactElements.ts';
import { groupMembers, repeatCopies } from '../lib/repeatGroup.ts';
import { findSetMembers } from '../lib/findSet.ts';
import type { RedactAction, RedactState } from '../state/redactState.ts';
import type { RedactArming } from '../hooks/useRedactArming.ts';
import type { RedactEditing } from '../hooks/useRedactEditing.ts';
import type { RedactPages } from '../hooks/useRedactPages.ts';
import type { RedactFind } from '../hooks/useRedactFind.ts';
import RedactBox from './RedactBox.tsx';

/**
 * The redaction boxes on one page (delete marks render separately - they have no
 * color/drag/resize, so RedactBox and the registry it draws through don't apply to them).
 */
export default function RedactPageBoxes({ index, state, dispatch, pages, arming, editing, pageSizesPt }: {
  index: number;
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  pages: RedactPages;
  arming: RedactArming;
  editing: RedactEditing;
  pageSizesPt: RedactFind['pageSizesPt'];
}) {
  const { elements } = state.edits;
  const { selectedBoxId } = state.selection;
  const { numPages } = state.document;
  const { eyedropping } = state.tool;
  return (
    <>
      {elements.filter((el): el is Exclude<RedactElement, { type: 'delete' }> => el.pageIndex === index && el.type !== 'delete').map(el => {
        // RED-03: the repeat button only offers pages that don't
        // already carry a copy - a dummy id generator here is
        // enough to answer "would this add anything", without
        // spending real ids on a box that may never be created.
        // Only the selected box shows its toolbar, so only it pays for
        // the linked-set lookups (each walks every element).
        const selected = el.id === selectedBoxId;
        const canRepeat = selected && numPages > 1 && repeatCopies(el, elements, numPages, () => '').length > 0;
        return (
          <RedactBox
            key={el.id}
            el={el}
            isSelected={el.id === selectedBoxId}
            peekAll={arming.peekAll}
            pageSize={{ width: pageSizesPt[el.pageIndex]?.width, height: pageSizesPt[el.pageIndex]?.height }}
            pointer={{
              onSelect: (id: string) => dispatch({ type: 'BOX_SELECTED', id }),
              onChange: editing.updateElement,
              getPageWrapper: () => pages.pageWrapperRefs.current[el.pageIndex],
              onHoverEnter: () => dispatch({ type: 'BOX_HOVERED', id: el.id }),
              onHoverLeave: () => dispatch({ type: 'BOX_UNHOVERED', id: el.id }),
            }}
            actions={{ onDelete: editing.deleteElement, onDuplicate: editing.duplicateElement, onChangeStrength: editing.changeBlurStrength }}
            color={{
              onPick: editing.pickColor,
              onMatchPage: editing.matchPage,
              recent: arming.recentColors,
              eyedropping: eyedropping === 'box',
              onToggleEyedropper: () => dispatch({ type: 'EYEDROPPER_TOGGLED', target: 'box' }),
            }}
            repeatGroup={{
              size: selected ? groupMembers(elements, el.id).length : undefined,
              onRepeatOnEveryPage: canRepeat ? editing.repeatOnEveryPage : undefined,
              onUnlink: () => editing.unlinkFromGroup(el.id),
              onKeepOnlyThisPage: () => editing.keepOnlyThis(el.id),
              onRemove: () => editing.removeLinked(el.id, 'repeatGroup'),
            }}
            findSet={{ size: selected ? findSetMembers(elements, el.id).length : undefined, onRemove: () => editing.removeLinked(el.id, 'findSet') }}
          />
        );
      })}
    </>
  );
}
