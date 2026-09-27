import type { WhiteoutElement, BlackoutElement, BlurElement } from '../../editor/model/editorModel.ts';
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
