# Sign highlighter: the line band

Chosen by Shlomi on 2026-10-31 from four sketched options: a text highlighter (snaps to the text
layer), a marker pen (freehand), a highlight box (a translucent rectangle) and the line band. The line
band won because it is the only one that behaves the same on a digital PDF and on a scan or a photo
of a form, and it stays straight under a finger. Ticket: [SIGN-46](../backlog/tasks/SIGN-46.md).

## What it does

- **One toolbar button, Highlight.** One-shot like every Sign tool: it disarms after one swipe, and a
  double-click locks it.
- **Swipe along a line of text.** The band is straight and as tall as the line under the press, from
  where the finger went down to where it is now. A finger drifting up or down inside the line changes
  nothing.
- **Drag down to carry it onto the next lines.** The first line runs from the press to its end, the
  middle lines are covered whole, and the last line runs from its start to the finger. This is how
  text selection reads, so it needs no explaining.
- **Ends settle on word gaps** when one is within reach, so a band never stops halfway through a word.
- **Off the text** (a blank margin, a photo), the band takes the height of the last highlight, or the
  default height, at the finger.
- **Six colors, the classic highlighter set:** yellow (the default), orange, pink, red, green, blue.
  The chosen color is remembered per document and becomes the default for new documents, like every
  other Sign setting.
- **Selected, a highlight moves, recolors and deletes.** No resize handles: fixing a band is one undo
  and one swipe. One swipe is one undo step.

| Color | Value |
| --- | --- |
| Yellow | `#FFF34D` |
| Orange | `#FFB15C` |
| Pink | `#FF8FCF` |
| Red | `#FF8080` |
| Green | `#9CF27A` |
| Blue | `#7FDBFF` |

Values are a starting point, tuned once against a real export on screen and in print. They are
document content colors, so they live next to `DEFAULT_COLOR_BLUE` in `src/editor/model/`, not in
`global.css`.

## How it finds the line: the page's pixels, one path for every page

The band never reads the PDF's text layer. It reads the page as Sign already painted it
(`src/editor-ui/PdfPageCanvas.tsx`), in a small window around the finger, and finds the text row there:

1. Take the window's gray pixels and threshold them (Otsu, reusing `otsuThreshold` from
   `src/lib/pageLayout/rasterInk.ts`).
2. Project ink onto the vertical axis. The row is the run of pixel rows with ink that contains the
   press point, padded a little above and below. Its core is where the ink is dense; it then grows
   through the sparse ascender and descender scanlines up to the first blank one, so the band covers
   the whole line, and the padding stops halfway into the leading so tight lines stay apart.
3. Inside that row, project ink onto the horizontal axis. Gaps wider than a fraction of the row height
   are word gaps, and the band's ends snap to the nearest one within reach.

That is one pure function, `findTextRow(pixels, point)`, returning the row's top and bottom and its
word gaps in page percent. Because it works on pixels, it behaves identically for digital and scanned
pages, Hebrew and English, and rotated pages (the canvas is already drawn in the rotation the person
sees). It needs no text extraction, no OCR and no code moved out of Redact. It lives in
`src/lib/pageLayout/` (READ-02), shared with Highlight PDF.

A band is level. On a skewed scan it follows the row found under the press, which holds at the small
skews a phone photo has after Scan flattens it. The scored check uses the five 200 dpi scans in
`src/tools/sign/lib/fields/corpus/snap/pages/`.

## Model

```ts
interface HighlightElement extends ElementBase, BoxGeometry {
  type: 'highlight';
  color: string;
  // One band per covered line, in percent of the element's own box, so a move moves them all.
  bands: Array<{ left: number; top: number; width: number; height: number }>;
}
```

The element's box is the bands' union. During the swipe the bands are painted straight into the DOM,
and state commits once on release (the gesture golden rule). The row-snapping patch comes from the
highlight definition rather than another `type === 'line'` branch in `useWorkspaceGestures.ts`.

## Export

Each band is one `page.drawRectangle` in the band's color with `blendMode: BlendMode.Multiply` and no
border, drawn into the page like every other Sign mark (not a PDF annotation). Multiply keeps the text
under it as dark as it was, on screen and in the file, and the on-screen node uses
`mix-blend-mode: multiply` so the two match.

## Where it touches the code

- Model and registry: `ElementType`, `EditorElement` (`src/editor/model/editorModel.ts`), a new
  `src/editor/registry/highlight.ts`, the `definitions` map (`registry/index.ts`), the `renderers` map
  (`registry/renderers.ts`), `ELEMENT_TYPES` in `registry/draftValidation.ts` (runtime list, not
  compile-checked), and `signElementTypeLabel` plus the English and Hebrew strings.
- Style memory: a `highlightColor` key in `DocumentStyle`, `validateDocumentStyle`, `carriedPatchFor`
  (so a highlight color never overwrites the shared shape and text `color`), `elementDefaultsFor`, and
  the initial value passed to `create`.
- Sign UI: `SIGN_TOOL_TYPES` and `TOOL_COPY` in `SignToolbar.tsx`, a `HighlightNode` in
  `PdfWorkspace.tsx`'s `ELEMENT_RENDERERS`, and a highlight block in `ElementToolbar.tsx` with the
  six-color picker and no thickness picker.
- Redact keeps it out through its `REDACT_ELEMENT_TYPES` allow-list.
