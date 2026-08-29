# Font feedback while editing

Text and a font selection are assessed together. A browser may display glyphs
from system fonts, but the PDF currently uses one bundled family per text box.

## Decisions

- `fonts.js` owns direct glyph coverage and whole-text fallback. No UI guesses
  coverage from a language label or from whether a fallback happened.
- `textFontSupport.js` derives three states: works as chosen, compatible
  automatic fallback, or incompatible combination. It uses the generated
  coverage table and the same text transforms as export, without a font fetch.
- `TextNode` owns its own feedback, memoized by text, family, weight, style and
  comb settings. The generic draggable shell has no font-validation logic.
- The font menu annotates every option before selection. A compatible option
  says it includes all the text; another option names its missing characters
  and, when available, the actual automatic replacement.
- Automatic fallback changes the rendered family only when one family covers
  the complete text. The requested family remains in state, so editing the text
  can restore it. The local notice explains the change.
- When no single font fits, recommendations preserve contiguous graphemes and
  identify a real font for each proposed text box. They are guidance only:
  splitting, repositioning or discarding text requires user action.
- Characters absent from every available font get replacement/removal guidance,
  not a promise that splitting the text will help.

For `שלום Hello مرحبا` with Assistant selected, the suggestion is
`שלום Hello` in Assistant and `مرحبا` in Scheherazade New. This is a font
combination limitation, not a claim that Hebrew or Arabic is unavailable.

## Interaction and verification

Notices sit below their text boxes without affecting layout. Inactive problems
retain a compact error icon at the bottom end of the text: bottom-right for LTR
and bottom-left for RTL. Selecting the icon opens the text and its full local
explanation. The selected box has a polite announcement and an associated
textarea description. Fixing the text clears the warning in the same render,
preserving the textarea and caret. Font notices are not PDF content.

Tests compare the presentation model and proposed pieces with actual bundled
TTF coverage, including pointed text, missing characters and comb truncation.
Component tests exercise menu annotations, automatic fallback, correction and
the persistent edit marker. Export validation remains a final integrity check.
