# UX design guidelines for PDkef tools

The app-wide guideline for how a PDkef tool looks, behaves and gets reviewed. First written
2026-09-13 from the Merge rebuild (the `merge-tool` epic, MERGE-01 to MERGE-18), where these choices
were made and measured; every later tool review adds to it here rather than in its own notes. It is
kept so the next tool review (Edit PDF Pages is the obvious next one, then Compress, Image to PDF;
Split is sketched, see §15) starts from what we already settled instead of rediscovering it. The Merge-specific spec is
[merge-direction-a-spec.md](./merge-direction-a-spec.md), the sketch is
[merge-direction-a-sketch.html](./merge-direction-a-sketch.html), and the review that drove the
second pass is [merge-review-2026-09-13.md](./merge-review-2026-09-13.md). Cross-tool hand-offs are
also a standing preference of the owner's; see the last section.

The goal these serve, in Shlomi's words: an experience good enough that people return and recommend
it. Merge is an authority fight in search, so the tool's job is retention, not ranking.

## 1. The output is the centre

The thing on screen is the document the person is about to download, as pages, in output order. The
inputs (files) are a rail beside it, never the main view. We considered three directions: A, the
merged document as a page grid with files as a rail; B, a file list first with pages under each; C,
per-file panels that keep pages inside their file. A won because B makes the inputs the subject and C
prevents moving pages across files. The test for any tool: can the person see exactly what they will
get before they get it, and change it there?

For a tool whose output is a single file (Merge, Edit Pages, Image to PDF, Compress with a visual
preview) this means a page grid. For Split, it means the output groups: one frame holding the
included pages in one mode, one frame per page in the other, with the left-out pages dimmed below
([split-stage-spec.md](./split-stage-spec.md)).

## 2. The simple case is the minimum

The most common use must be the shortest path: pick files, Download. No intermediate "Merge" step,
no "Apply" that only exists so a button can appear. The work happens on idle, debounced after the last
change, cancelled by the next change, so Download is ready by the time the person reads the page.

There is one primary element and it has states, rather than a button that appears:

- one file: a sentence ("Add one more PDF to merge") with a real nested action (Choose files), never a
  disabled button, never a grey box the size of the rail's largest element;
- preparing: the same element, tinted, with a ring, still tappable (the tap downloads on completion);
- ready: the filled button with honest numbers, "25 pages · 2.6 MB";
- saved: the same, with the check, and the next steps below it.

Honest numbers beat verbs. "Download merged PDF, 25 pages · 2.6 MB" tells the person what they will
get; "Merge now" tells them nothing.

Analytics follows intent: the operation counts when the person taps Download, not when the tool
pre-computes.

## 3. Disclose by state, not by disclosure

Options and next steps appear only once an output exists. Below two files there is nothing to
configure, so nothing is shown. A `<details>` around a single setting is ceremony: one checkbox is a
checkbox row. A setting that changes the output sits directly above the primary control, because that
is where the eye is when it matters.

"Exists" means ready, not "the person already tapped the primary control." Share and Compress it are
gated on the output being prepared, the same instant the primary control's label changes from
preparing to ready; gating them on `saved` instead (Split's first build did) hides them behind an
action the person has not taken yet, which is the wrong order for something meant to sit next to
Download. A share button that already knows how to hide itself when nothing is ready needs no outer
gate on top of its own.

A default is shown as a choice among its alternatives, never as one card tinted among lookalikes. A
segmented control with both options side by side says "there is another way"; two cards where one is
preselected read as done, and people skip it (a real Split user did, and got the wrong output). When
the setting changes the shape of the output, the canvas changes shape with it, in place: the preview
is the setting. Never number a step that needs no action; "1. Select mode" over a preselected default
is exactly what gets skipped.

Explanations are one line, appear when they apply and disappear when they do not. "Pages moved across
files, so files no longer drag as a whole" shows only after a page has crossed a file, with Reset
order on the same line. Above the first thumbnail there is only the heading and the count. The
cognitive budget of the loaded state is: heading, one status line, the document, the rail.

## 4. Every row is one kind of thing

The rail order that came out of the review, top to bottom, each row a single kind:

1. the inputs (file list), with its own footer note when one applies;
2. a status line ("Draft saved", "Saving draft…"), alone, end-aligned, so its changing width never
   moves a control and the RTL edition mirrors it for free;
3. commands on the list (Add files, Clear all);
4. the setting that changes the output (Add page numbers);
5. the primary control (Download);
6. next steps (Share, Compress it, Sign it), each with its tool's icon.

Do not mix a setting into a row of commands: a switch among buttons reads as a button. Do not put a
"·" between buttons; that is link grammar. Reset order, Add files and Clear all are buttons and look
like buttons: bordered, no fill, one height (36px face, 44px hit area). Underline is for links that
navigate.

A quiet secondary link that only restates a control already visible one glance away is chrome, not a
second entry point. Split's primary control once carried "or save each page as its own PDF" under it
on the assumption the setting above might have scrolled out of view; once §15's stage actually kept
the setting and the primary control in the same block, the line just repeated the segmented control
sitting directly above it, and came out. Draw the adjacent-control check before adding a quiet link:
if the thing it offers is already on screen right next to it, the link is dead weight, not a second
chance to notice it.

## 5. Name the output, and let people rename it in place

The heading of the loaded state is the file name the person will get, "merged_<first file>", with
".pdf" shown muted and fixed. At rest it is a heading and nothing else: no box, no border, no pencil
in the text. Click or tap the name and it becomes editable where it is, same font, same size, caret
where the person clicked, zero layout shift. Enter or blur commits, Escape cancels, empty reverts
to the automatic name. Once edited, the name is theirs and stops following the
first file; Clear all resets it; the download attribute and the PDF Title follow it. The name has one
home: no "Saves as" line elsewhere.

The default pattern is decided (revised 2026-09-13): `merged_<first file base name>.pdf`, the same
shape as `signed_x.pdf` and `compressed_x.pdf`, chaining when the first file already carries a
prefix. No count, no connector, never a "+" in a file name. A prefix in the tool's language followed
by the name in its own direction needs no bidi isolation and no per-edition template.

## 6. Undo over confirm

Reversible actions get an Undo chip for five seconds ("Moved page 3 · Undo", "Removed X · Undo") and
never a dialog. Only destructive, non-recoverable actions confirm (Clear all, replacing a saved
draft). Every keyboard action announces through a live region.

## 7. Labels, not hints

Files are identified by a small tag (colour dot plus name) above the first page of their run, and by a
full caption row only for runs of four pages or more. The same colour dots mark the file rows in the
rail, so the two views agree without a legend. Icon buttons show their word under the icon on hover
and on focus; on touch the word is always there or the control is not an icon.

## 8. Touch is not hover with bigger targets

- 44px targets throughout. A 32px glyph may sit inside a 44px hit area.
- No hover-only affordance on touch. Per-item controls do not fit small cells (three 44px buttons
  cannot live on a 72px page cell; they overlapped the neighbours and hid each other). On the phone,
  tap an item to reveal that item's controls, or select it and act from one bar; either way the grid
  never reflows when a mode changes.
- The primary control is a sticky bottom sheet, in flow, with the safe-area inset. Secondary commands
  live in a "…" popover anchored at the inline end, so the Hebrew edition flips it.
- On the phone, Share may matter more than Download: it is how a phone saves to Files, AirDrop and
  messages. It leads the next-steps row wherever the browser can share files.

## 9. Bidi is part of the design, not a fix

- A file name is laid out in its own direction (`unicode-bidi: plaintext`) with a middle ellipsis
  that keeps the number and the extension, so "טופס 1301.pdf" keeps its "1301.pdf".
- A name composed into a sentence or a template is isolated (`<bdi>` or FSI/PDI), or "+ 7" attaches
  to the Hebrew run and the line reads "signed_7 + … more.pdf".
- Alignment is `start` and `end`, never left and right, so `/he/` mirrors without overrides.
- Test with real Hebrew names in every pass; they surface truncation and layout bugs that Latin names
  hide.

## 10. Speed is part of the experience

Download being ready before the thumbnails is fine. Thumbnails at two per second is not: on twenty
trivial pages the document is a field of dashed placeholders for ten seconds, and after a restore on
a phone the first screen is blank. Target: twenty trivial pages under two seconds, the first visible
row before the heavy work starts, one open pdf.js document per file for the life of the view. Restore
must set scroll restoration ahead of the reload and scan the viewport itself, since an
IntersectionObserver never reports in a hidden document.

## 11. Drafts are a quiet feature

Work survives a crash or a closed tab on the device. The tool says so in a status line ("Draft
saved"), never a banner, and on return says "Picked up where you left off · Start fresh" once, under
the heading, never twice and never as a modal. Clear all deletes the draft. The record carries every
input file and the arrangement (order, rotation, skips, the edited name) and is capped at 200 MB.

## 12. Empty state is a band, not a void

Three ghost page outlines, "Drop PDFs here, or paste", the privacy line, and Choose files, in a
260px band. Never a viewport-filling dashed box.

## 13. Cross-tool hand-offs, and the reverse

The done state asks "what does this person do with the result next?" and offers the one or two
honest answers as quiet secondary verbs with the target tool's icon: Compress it, Sign it. Never in
front of Download, never a sales row, always in the voice. Look for the reverse too: an error or
empty state that points at the sibling tool that solves it (an encrypted file linking to Unlock, an
oversized draft to Compress). Candidates already visible: Split → Compress, Merge these; Unlock →
Sign; Image to PDF → Merge; Compress → Sign; Sign → Compress for portals with size caps.

## 14. How we review

- Measure in a real browser, at 1280 and 375, with getBoundingClientRect and getComputedStyle; a
  claim in a report is not a result until it is measured. Inject files through the real input.
- Fixtures include one-page scans (the commonest merge), a long run with a landscape page, Hebrew
  names, and a file meant to fail (check that it really fails; a pdf-lib "encrypted" fixture did not).
- Findings are ranked P1 to P3, each with a reproduction, a fix and an acceptance line with numbers
  in it, so the builder can close it without interpretation.
- The Impeccable critique (dual agent, heuristic scoring) is a good first pass; its snapshot lives
  under `.impeccable/critique/`. It scores; it does not decide direction. Direction comes from
  sketches the owner picks between.
- Verify the phone view on a real phone for anything the emulator cannot do (Web Share, scroll
  restoration, keyboard).

## 15. The stage: canvas and commands stay together

The loaded state is one stage, the canvas and its commands, and a command that changes the output is
never out of view while the canvas is. On desktop the rail is sticky beside the canvas; below that
the commands on the selection become a sticky chip bar above the canvas and the setting plus the
primary control become a sticky bottom sheet. A width where the rail stacks under the canvas is a
bug, not a breakpoint: scroll to the last row and the mode is gone, which is the Split failure
again. The test: at 1280, 820 and 375, scrolled to the canvas's last row, the control that changes
the output is fully inside the viewport. Split's stage is the reference
([split-stage-spec.md](./split-stage-spec.md)); Merge's own tablet width still stacks and should
move to the sheet.

## 16. A display-only transform never hides more than the untransformed state did

Rotate is the clearest case, and it now exists in three tools (Merge, Edit Pages, Split), but the
principle is general: any control that changes how a page *previews* - rotate, a zoom, a fit toggle -
must never crop content the untransformed preview showed. A crop is a content decision the person
makes on purpose (Edit Pages' trim, Redact's mark); a rotate button is not one, and a person who taps
it has not asked to also lose part of the page.

Split's rotate shipped this exact bug and a real user hit it on the first try: a rotated ID scan's own
photo went missing, because the thumbnail's crop rule (`object-fit: cover`, tuned for the unrotated
aspect) was still active on the rotated, box-swapped preview, and cropped a thin sliver instead of the
whole page. The fix is `object-fit: contain` for the transformed state - letterboxed but complete beats
edge-to-edge and missing the one thing (a photo, a signature, a stamp) the person opened the tool to
check. Verify with a fixture that has something in the region a naive crop would take first, not a
fixture where any crop looks fine (blank pages and centred content hide this bug completely; the
regression here shipped past three centred-content unit tests and would have shipped past the whole
Playwright suite too).

A second, unrelated way the same feature breaks: a preview that resizes a box to compensate for the
rotation (so the rotated footprint still fills its cell) is fragile inside a flex or grid container -
the container's own default sizing (`flex-shrink: 1`, or a pre-existing `max-width: 100%` on the same
element) can silently override the compensating size before the rotation ever runs, on one axis but
not the other, which is easy to miss because it looks like a small cosmetic gap rather than a wrong
number. Measure the rotated box's own `getBoundingClientRect()` against its container's, not just a
screenshot - the crop bug above hides inside a rect that measures perfectly.

1. What is the output, and is it the centre of the loaded state?
2. What is the shortest path for the common case, and does any step exist only to make a button
   appear?
3. Which controls appear before an output exists, and why?
4. Is every row one kind of thing, in the order inputs, status, commands, setting, primary, next
   steps?
5. Is the output named, honestly counted, and renameable?
6. Which actions confirm, and could they undo instead?
7. What happens on a 72px cell with a finger?
8. Do Hebrew names survive every place a name is shown?
9. How long until the first visible row renders, and after a restore?
10. What does the person do next, and does the done state say so?
11. If a setting changes the shape of the output, does the canvas change shape with it, and can the
    person reach the setting without scrolling away from the canvas?
12. Does any preview transform (rotate, zoom, fit) crop more of the page than the untransformed
    preview did, checked with a fixture that has real content near an edge, not a blank or centred one?
