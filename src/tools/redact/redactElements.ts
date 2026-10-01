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

/**
 * RED-51: where a whiteout's colour comes from. 'auto' is matched to the page
 * around it and re-sampled whenever it moves or resizes; 'custom' is a colour
 * the person chose. Absent means custom, so a draft saved before RED-51 keeps
 * its colour. Not "fill mode": that already names Sign's form-filling UX.
 */
export type ColorMode = 'auto' | 'custom';

export interface ColorModeField {
  colorMode?: ColorMode;
}

export type RedactBoxElement = ((WhiteoutElement & ColorModeField) | BlackoutElement | BlurElement) & Links;

/** RED-32: a painted stroke. Selectable, deletable and recolourable like a box, never resized. */
export type RedactStrokeElement = (BlurStrokeElement | (WhiteoutStrokeElement & ColorModeField)) & Links;

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

