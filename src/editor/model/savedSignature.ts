/**
 * A reusable signature kept in the editor's on-device library.
 *
 * This is deliberately distinct from `SignatureElement`: a saved signature has
 * no page or geometry until the placement gesture turns it into an element.
 */
export interface SavedSignature {
  id: string;
  dataUrl: string;
  /** Image height divided by image width. */
  aspectRatio: number;
}
