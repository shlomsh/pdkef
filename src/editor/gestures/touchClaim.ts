/**
 * SNG-04: whether a touch that begins on an element is the one that gets to
 * move it, or whether it should fall through to the browser's own native
 * scroll instead.
 *
 * docs/sign-next-gen-guidelines.md §2.2 - touch only, fill mode only: a
 * finger meant to scroll over an already-placed element must not drag it.
 * The rule this function states is exactly "a touch never moves an element
 * that was not selected before the touch began" - a one-finger swipe on an
 * unselected element in fill mode is native panning, not a drag; selecting
 * it first (a plain tap, delivered as the synthesised mouse click once the
 * touch is let through) restores the ordinary drag-to-move behaviour on the
 * next touch. Mouse is unchanged everywhere: this function is only ever
 * consulted for a touch gesture, never a mouse one, so a click still
 * selects and moves in one gesture regardless of `touchNeedsSelection`.
 *
 * Pure and standalone, per SIGN-32..34's "detection and memory are pure,
 * apart from the UX" precedent: the decision belongs in `src/editor/` so
 * any touch surface can ask it the same question without re-deriving it.
 */
export function touchClaimsElement({
  touchNeedsSelection,
  wasSelected,
}: {
  touchNeedsSelection: boolean;
  wasSelected: boolean;
}): boolean {
  return !touchNeedsSelection || wasSelected;
}
