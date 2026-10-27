import { uniqueId } from '../../../editor/model/ids.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { formatMessage } from '../../../lib/formatMessage.ts';
import type { RedactElement } from '../lib/redactElements.ts';
import type { FindMatch } from '../lib/find/types.ts';
import type { RedactState } from '../state/redactState.ts';
import { englishRedactMessages as t } from '../messages.ts';
import useFind from './useFind.ts';
import usePageSizesPt, { needsPageSizes } from './usePageSizesPt.ts';
import type { RedactEditing } from './useRedactEditing.ts';

/**
 * RED-02: find and redact. Every box of every chosen match (one per line the
 * match covers) is added as one history entry, so one Undo takes back a whole
 * "Redact all". Also reads the page sizes (RED-52) the boxes' arrow keys and
 * the brush need, because both ride on the same document reads.
 */
export default function useRedactFind({ state, setAnnouncement, commands, brushArmed }: {
  state: RedactState;
  setAnnouncement: (message: string) => void;
  commands: RedactEditing['commands'];
  brushArmed: boolean;
}) {
  const { elements } = state.edits;
  const { pdfDocument, numPages } = state.document;
  const { activeBlurStrength } = state.tool;
  const find = useFind(pdfDocument, numPages, elements);
  // RED-52: reading sizes only for blur left whiteout and blackout boxes deaf
  // to the arrow keys; needsPageSizes names everything that needs them.
  const pageSizesPt = usePageSizesPt(pdfDocument, numPages, needsPageSizes(elements, brushArmed));

  const redactMatches = (matches: FindMatch[]) => {
    if (matches.length === 0) return;
    const type = find.redactStyle;
    const additions: RedactElement[] = matches.flatMap((match) => match.boxes.map((box) => ({
      id: uniqueId(),
      pageIndex: match.pageIndex,
      ...box,
      type,
      ...(type === 'blur' ? { strength: activeBlurStrength } : { color: '#000000' }),
    })));
    // RED-11: two or more boxes from this action share a findSetId, so they
    // can be removed together and share blur strength later; a single box
    // joins no set. "Redact this" on one match that wraps onto a second line
    // makes two boxes, and they do form a set: both halves hide one secret.
    if (additions.length >= 2) {
      const findSetId = uniqueId();
      additions.forEach((addition) => { addition.findSetId = findSetId; });
    }
    const nextId = find.nextOpenAfter(new Set(matches.map((match) => match.id)));
    // RED-37: never the matched text itself - the description is announced
    // and shown in the undo chip, and reading a secret aloud is what the box
    // was for.
    const description = matches.length === 1 ? t.coveredOne : formatMessage(t.coveredMany, { count: matches.length });
    commands.add(additions, { type: 'FIND_AND_REDACT', description, undoChip: true });
    recordAction('place_mark');
    setAnnouncement(`${description}.`);
    find.setCurrentId(nextId);
  };

  return { find, pageSizesPt, redactMatches };
}

export type RedactFind = ReturnType<typeof useRedactFind>;
