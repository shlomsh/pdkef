import type { WhiteoutElement, BlackoutElement, BlurElement, BlurStrokeElement, WhiteoutStrokeElement, ColorMode } from '../../../editor/model/editorModel.ts';
import type { DeleteElement } from '../../../editor/registry/draftValidation.ts';

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

export type { ColorMode };

export interface ColorModeField {
  colorMode?: ColorMode;
}

export type RedactBoxElement = ((WhiteoutElement & ColorModeField) | BlackoutElement | BlurElement) & Links;

/** RED-32: a painted stroke. Selectable, deletable and recolourable like a box, never resized. */
export type RedactStrokeElement = (BlurStrokeElement | (WhiteoutStrokeElement & ColorModeField)) & Links;

export type RedactElement = RedactBoxElement | RedactStrokeElement | DeleteElement;

export function isDeleteElement(el: RedactElement): el is DeleteElement {
  return el.type === 'delete';
}

