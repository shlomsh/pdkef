import type { SignMessages } from './messages';
import type { ElementUpdateKind } from '../model/updateKind';
import { formatMessage } from '../../lib/text/formatMessage';

/** The whiteout colour group's text from a message table (the shape of `WhiteoutColorLabels`). */
export function whiteoutColorLabels(t: SignMessages) {
  return {
    group: t.whiteoutColorGroupLabel,
    auto: t.whiteoutAutoLabel,
    autoTitle: t.whiteoutAutoTitle,
    pipette: t.whiteoutPipetteLabel,
    useColorTemplate: t.whiteoutUseColorTemplate,
    customColor: t.whiteoutCustomColorLabel,
  };
}


/**
 * LOC-16: the one place a Sign element/tool id resolves to its displayed
 * name, reused everywhere a description or announcement would otherwise
 * interpolate a raw id (`.claude/rules/editor.md`'s "never interpolate a raw
 * tool id into copy" - the bug this ticket's useWorkspaceGestures.ts fix and
 * PdfSignTool.tsx/PdfWorkspace.tsx's history descriptions all share). Takes
 * the already-merged `SignMessages` so callers outside SignToolbar.tsx (which
 * builds its own richer TOOL_COPY for arm-hints) get the same button/shape
 * labels without a second catalogue of tool names.
 */
export function signElementTypeLabel(t: SignMessages, type: string): string {
  switch (type) {
    case 'text': return t.textButton;
    case 'symbol': return t.symbolsButton;
    case 'signature': return t.signButton;
    case 'whiteout': return t.whiteoutButton;
    case 'ellipse': return t.ellipseLabel;
    case 'rectangle': return t.rectangleLabel;
    case 'line': return t.lineLabel;
    default: return type;
  }
}

/**
 * UNDO-04: the history description for a logged move, resize, style change or
 * text edit, in the tool's own words - the same `{label}` interpolation
 * `signElementTypeLabel` supplies the other description templates above.
 */
export function signUpdateDescription(t: SignMessages, kind: ElementUpdateKind, type: string): string {
  const label = signElementTypeLabel(t, type);
  switch (kind) {
    case 'move': return formatMessage(t.movedElementDescriptionTemplate, { label });
    case 'resize': return formatMessage(t.resizedElementDescriptionTemplate, { label });
    case 'style': return formatMessage(t.styledElementDescriptionTemplate, { label });
    case 'text': return t.editedTextDescription;
  }
}
