---
id: "SITE-42"
title: "Home: picked files wake the toolbar, which becomes the tool chooser"
status: "open"
priority: "P2"
epic: "polish"
horizon: "now"
depends_on: []
needs: "Pick the copy, and try the rough build on your iPhone"
---

# SITE-42 · Home: picked files wake the toolbar, which becomes the tool chooser

*Seen 2026-10-12: a new visitor (no recents) came to merge two files and clicked the home dropzone
first, expecting to choose the tool afterwards.*

## Why

The home page's only call to action promises one thing and does another. The tile reads "Choose
files / or drop PDFs here", but:

- the picker takes one file (`src/site-lib/FileDropzone.tsx`, input without `multiple`;
  `FileDropzone.test.tsx` asserts `multiple === false`);
- that one file always goes to Sign (`toolTarget="sign"` in `HomePageLayout.astro`), without asking;
- two dropped files end in a plain-text error naming Merge, with no link (`toolMessages.ts`, "Choose
  one PDF here, or use Merge PDF below for several files.");
- a dropped image ends in "Please choose a PDF file."

"File first, tool second" is a sound mental model, and the dropzone is the page's main call to
action, so the fix is to keep it and make it honest. The second goal is teaching: a first-time
visitor should come away knowing that the toolbar at the bottom of the first screen is where all
ten tools live. So the chooser is not a new list inside the tile; **the toolbar itself is the
chooser**.

## Design

The tile accepts several files, PDFs and images. What was picked decides how much to ask:

| Picked | Tile shows | Toolbar | Then |
| --- | --- | --- | --- |
| nothing yet | "Choose files" / "or drop them here, then pick a tool below" | as today | |
| one PDF | the file name / "Now pick a tool below", and "Change" | the eight PDF tools lift, Image to PDF and Compress Image dim | a click on a lit tool opens it with the file |
| two or more PDFs | "2 PDFs" / "Opening Merge PDF..." | Merge lights, the rest dim | straight to Merge: it is the only tool that takes several PDFs (every other PDF tool sets `multiple={false}`) |
| images | "3 photos" / "Now pick a tool below", and "Change" | Image to PDF and Compress Image light, the rest dim | a click on a lit tool opens it with the images |
| PDFs and images mixed | the same as images, with the PDFs set aside | as images | Image to PDF takes `image/jpeg,image/png` only, so say which files were left out |

The copy above is a draft; Shlomi picks the strings. The sketch from 2026-10-12 shows the four
main states on a 375px phone and on desktop.

- Focus moves to the first lit tool, and an `aria-live` line announces the prompt. "Change" and
  Escape return to the resting state. A dimmed tool stays a plain link to its page, without the file.
- **Phone: the toolbar scrolls sideways.** Measured on pdkef.com at 375 x 812 on 2026-10-12: Sign,
  Redact, Compress and Merge are visible, PDF to Image is cut off, and Image to PDF and Compress
  Image are off screen. When the toolbar wakes, it scrolls the first lit tool into view (for
  images, Image to PDF and Compress Image both fit once scrolled).
- The starter tile ("PDkef practice form.pdf") keeps opening Sign directly; Sign is also first in
  the toolbar, so a single PDF's most likely job keeps the first position.

## Constraints

- **Nothing is inserted into the first screen and nothing moves** (`.claude/rules/home-page.md`).
  The tile changes its own contents inside its reserved box, and the toolbar's state is a
  `data-` attribute on the existing hero that CSS styles. No layout shift: the CLS guards from
  MOBI-35/36/37 must stay green.
- **The toolbar stays static HTML links** that work without JavaScript. The `FileDropzone` island
  attaches its click handler to the toolbar only while files are waiting, the same way it already
  attaches the hero-wide drop target.
- The waiting state is cleared on a bfcache restore (`useNavigatingAway()`, DEBT-21), so Back from a
  tool never shows a woken toolbar for files that already left.
- **Pure routing, thin component.** One pure function decides the state from the picked files, for
  example `routeFiles(files) -> { kind: 'auto', tool } | { kind: 'choose', fits, skipped }`, unit
  tested on its own. `FileDropzone` only renders what it returns.
- Files never leave the device: the hand-off is IndexedDB, as today.

## Hand-off contract (new work)

`saveHandoff` (`src/lib/drafts/draftStore.js`) carries one file per record, and `takeHandoff`
returns null unless the record has `fileBytes`. Today only Sign, Redact, Compress, Split and
Protect & Unlock take a hand-off (`useHandoffIntake.ts`, `useEditorDraftPersistence.ts`).

- Add a multi-file record, `{ files: [{ fileName, fileType, fileBytes }], from? }`, beside the
  single-file one; `takeHandoff` returns either shape. Existing receivers keep reading `fileBytes`.
- Add intake to every tool the toolbar can light: Merge, Image to PDF and Compress Image read
  `files`; PDF to Image and Edit PDF Pages read the single-file shape.

## Localized home pages

`src/pages/[locale]/index.astro` renders the same `HomePageLayout`, and the launcher hands off
through the locale's own `toolHrefs` (LOC-09). The woken toolbar uses the locale's hrefs, and every
new string has a Hebrew row in `toolMessages.ts`.

## Acceptance

- Picking two PDFs on the home page opens Merge with both files listed, in pick order.
- Picking one PDF wakes the toolbar; each lit tool opens with that file loaded. On a 375px phone,
  the first lit tool is in view without scrolling the page.
- Picking images wakes the toolbar with the two image tools lit and in view on a 375px phone; each
  opens with the images loaded.
- Back from any of those tools shows the home page at rest.
- The toolbar links work with JavaScript off; no layout shift on any state change.
- Tests start red: the pure routing function's table, the flipped `multiple` assertion, and one
  e2e for the phone toolbar scrolling the lit tools into view (a rendered rect, which jsdom cannot
  prove).
