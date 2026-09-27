import type { WhiteoutElement, BlackoutElement, BlurElement, RedactToolType } from '../../editor/model/editorModel.ts';
import type { DeleteElement } from '../../editor/registry/draftValidation.ts';

/**
 * The Redact element types for the island to adopt (RED-14). Box elements
 * reuse the shared editor model's Whiteout/Blackout/Blur interfaces, each
 * carrying Redact's own cross-element links; `DeleteElement` (draftValidation.ts)
 * is Redact-only and never routes through the shared editor registry.
 */
export interface Links {
  repeatGroupId?: string;
  findSetId?: string;
}

export type RedactBoxElement = (WhiteoutElement | BlackoutElement | BlurElement) & Links;

export type RedactElement = RedactBoxElement | DeleteElement;

export function isDeleteElement(el: RedactElement): el is DeleteElement {
  return el.type === 'delete';
}

export function isBoxElement(el: RedactElement): el is RedactBoxElement {
  return el.type === 'whiteout' || el.type === 'blackout' || el.type === 'blur';
}

// RED-14: PdfRedactTool.tsx's own element type, with an index signature for
// Redact-only fields (sourceObjectId, kind, preview, start, end) that
// `RedactElement` above (a closed discriminated union) types per-branch
// instead. Its geometry and link fields are named explicitly, not left to
// the index signature, because repeatGroup.ts's GroupableElement and
// links.ts's LinkedElement now require them as concrete properties - an
// index signature alone doesn't satisfy a required property in a structural
// check. Exported from here, not from PdfRedactTool.tsx itself, so
// useDeleteTool.ts and useLinkedBoxes.ts can import it without an
// island-to-hook import cycle.
export type RedactHistoryElement = {
  id: string;
  pageIndex: number;
  type: RedactToolType;
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
  strength?: unknown;
  repeatGroupId?: string;
  findSetId?: string;
  [field: string]: unknown;
};
