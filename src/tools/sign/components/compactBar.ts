// SNG-17: pure eligibility predicate for the compact one-row text toolbar
// (Previous/Next/Aa in production, Aa alone in fill mode - see
// DraggableWrapper.tsx's render branch). Extracted so the rule that decides
// *when* the full formatting bar would overflow a phone-width page is
// readable and testable on its own, apart from the JSX that acts on it.
//
// Today's production rule (MOBI-16): a text element, actually in its edit
// session, on a coarse pointer, with a fieldNav supplied (only the element
// currently being typed into ever gets one - see DraggableWrapper's own
// `fieldNav` prop doc).
//
// SNG-17 adds a second path: fill mode (`?next=1`) never supplies a
// fieldNav (docs/sign-fill-mode.md - the keyboard's own Next/Previous moves
// between fields there), but its text elements still sit inside the same
// ~290px page wrapper on a phone, so the full bar still wraps to a two-row,
// ~80px-tall block that covers the two form rows beneath it. The compact
// row is just as needed there, minus the Previous/Next pair fieldNav would
// have driven.
export default function compactBarFor({
  isText,
  isEditing,
  coarse,
  hasFieldNav,
  fillMode,
}: {
  isText: boolean;
  isEditing: boolean;
  coarse: boolean;
  hasFieldNav: boolean;
  fillMode: boolean;
}): boolean {
  return isText && isEditing && coarse && (hasFieldNav || fillMode);
}
