import type { WhiteoutElement, BlackoutElement, BlurElement, BlurStrokeElement, WhiteoutStrokeElement, RedactToolType } from '../../editor/model/editorModel.ts';
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

/** RED-32: a painted stroke. Selectable, deletable and recolourable like a box, never resized. */
export type RedactStrokeElement = (BlurStrokeElement | WhiteoutStrokeElement) & Links;

export type RedactElement = RedactBoxElement | RedactStrokeElement | DeleteElement;

export function isStrokeElement(el: RedactElement): el is RedactStrokeElement {
  return el.type === 'blurStroke' || el.type === 'whiteoutStroke';
}

export function isDeleteElement(el: RedactElement): el is DeleteElement {
  return el.type === 'delete';
}

export function isBoxElement(el: RedactElement): el is RedactBoxElement {
  return el.type === 'whiteout' || el.type === 'blackout' || el.type === 'blur';
}

