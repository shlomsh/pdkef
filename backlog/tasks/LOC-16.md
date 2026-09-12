---
id: "LOC-16"
title: "Finish the Hebrew edition: HeroDemo, the rest of the Sign editor, the compress-hub guides, and the home page sign-off"
status: "open"
priority: "P2"
epic: "hebrew-edition"
phase: "near-term"
depends_on: ["LOC-09"]
legacy_state: "Open"
---

# LOC-16 · Finish the Hebrew edition: HeroDemo, the rest of the Sign editor, the compress-hub guides, and the home page sign-off

*Re-filed 2026-09-12* from `localized-search` into `hebrew-edition`.

## Scope and acceptance

[LOC-09](LOC-09.md) closed 2026-09-12 with `/he/` live, indexable, RTL-correct, and a fully Hebrew tool
dock, but it was not whole: four surfaces are still English or unreviewed, and one is missing outright.
Two of LOC-09's open questions were product decisions that only Shlomi could make; he made them today
(2026-09-12) and they are recorded below as closed, not to be reopened. Everything that is left is
engineering work, not a decision, and it lands here so LOC-09 does not carry an open-ended tail.

**Decided today, not open items here:**

- **The RTL-mirrored tool dock stays.** LOC-09's open question #2 (§4.1: is CSS flexbox's automatic
  RTL mirroring of `.home-dock`'s icon order the wanted behavior for a UI element meant to read as a
  fixed "dock" position, or does it need an explicit override). Shlomi judged it on the built page and
  keeps the auto-mirror. No override, no ticket item for it.
- **HeroDemo is to be translated**, not left English indefinitely. LOC-09's open question #1 (§4.2).
  This does not settle the direction-of-motion sub-question, which is item 1 below.

**Acceptance**, one line per work item:

1. **Done 2026-09-13.** `/he/` HeroDemo reads in Hebrew; the direction-of-motion question is answered
   (mirror) and implemented; the `heroDemoEnglishNotice` shell message and the `[data-home-demo]` purity
   exemption are both removed; whole-page purity re-measured with no exemption in play: 0.930.
2. `sign` joins `LOCALIZED_TOOL_ISLANDS` (`src/i18n/localizedTools.ts`); the sr-only
   `data-tool-controls-english` disclosure disappears from `/he/sign/`; `/he/sign/` still passes the
   purity guard without a tool-island exemption; `/sign/` and its existing tests are untouched.
3. Both compress-hub guides (`pdf-wont-compress-to-100kb`, `photo-and-signature-size-for-forms`) have a
   Hebrew edition in `src/content/localized-pages/he/`, cited to real Israeli portal limits, through the
   same draft/preview/review gate the other eight Hebrew guides used.
4. `src/content/localized-home/he.yaml`'s `reviewer`/`reviewedAt`/`reviewNotes` reflect Shlomi's own
   read-through, not an AI draft; the same for the Hebrew `FileDropzoneMessages`/`RecentFilesMessages`
   and `SignMessages` Hebrew objects in `src/i18n/toolMessages.ts`; the languages page's home cell moves
   from `published` to `reviewed`.
5. `Accept: text/markdown` on `/he/` returns a Hebrew markdown twin instead of falling through to
   `/404.md`.

### 1. HeroDemo in Hebrew (done 2026-09-13)

**Shipped.** `src/components/HeroDemo/HeroDemo.astro` renders every string (both sr-only narrations, the
captions, the simulated chat, form, share sheet, inbox, bill and reply) from a typed catalogue,
`src/i18n/heroDemoMessages.ts` (`englishHeroDemoMessages` verbatim from the old markup,
`hebrewHeroDemoMessages` an AI draft that Shlomi read on the built page and approved, the same
draft/approve path as the dock cards; `heroDemoMessages.test.ts` holds key parity, no empty strings, no
em dashes). Design doc section 5.5's shape, not a per-locale fork. Story one is an Israeli class group
and a parents' trip permission slip (אישור-הורים-לטיול.pdf, כיתה ד׳2, מוזיאון המדע); story two a
חשבון חשמל with Israeli billing terms (מספר חוזה, קוט"ש, ₪). The blurred, blacked-out and whited-out
values keep their digits. `HomePageLayout.astro` passes `locale`; the `heroDemoEnglishNotice` key, its
render and style block, and the `[data-home-demo]` exemption in `scripts/localizedSeoChecks.mjs` are
gone.

**Direction of motion: mirror** (design doc section 4.2 option 1), decided by Shlomi on the built page
the same day. Reasoning: a Hebrew phone already mirrored its chat bubbles on `/he/` (logical margins),
and mirrors its push navigation and share sheet, so a phone that kept sliding LTR inside a mirrored chat
would be the one foreign element. Implementation is not the rewrite section 4.2 feared: one `--hero-dir`
custom property on `.root` (`1`, `-1` under `html[dir="rtl"]`) multiplies the story slide, the three
in-phone `translateX()` pushes and their shadow x-offsets; the six `clip-path: inset()` reveals (four
form blanks, blackout and whiteout bars) get explicit RTL overrides because `inset()` has no signed
offset to multiply. `ScrollDriver.tsx` is untouched. Two Hebrew-only CSS follow-ups from the screenshot
pass: bill values fall back to `--font-sans` with tabular digits (no face in `--font-mono` has Hebrew, the
generic fallback letter-spaced the words), and file names sit in an LTR-isolated `<bdi>` so `.pdf` lands
on the visual right (Shlomi's call; plain bidi puts it on the left).

**Measured on the built page** (Playwright Chromium over `dist/`, 1280x800 and 390x844, both locales):
CLS 0 on desktop and identical to the English baseline on mobile; the arriving email row still 73.4px
inside `--email-row-height: 74px`; no clipped or overflowing element inside the Hebrew phone at any
beat; whole-page purity on `/he/` **0.930** (3983 of 4284 letters) with no exemption, against 0.906
measured under LOC-09 with the demo excluded; the demo alone 0.983 (remaining Latin: "PDF", ".pdf",
MTR-88291). English `/` transforms byte-identical before and after; its HTML differs only by Astro's
`&#39;` escaping and the bare `<bdi>` wrappers. The `.home-tour` scroll-span math was not touched and
did not need to be.

### 2. Sign island stages 2 to 5

**What exists (stage 1, shipped in LOC-09).** The toolbar row on `/he/sign/`, roughly 40 of the ~136
inventoried strings, reads in Hebrew through a `SignMessages` catalogue in `src/i18n/toolMessages.ts`
(`englishSignMessages`/`hebrewSignMessages`, built the same way `MergeMessages`/`CompressMessages` are:
English values verbatim from source, a Hebrew object marked as an AI draft pending review).
`SignToolbar.tsx` spreads it as `t: SignMessages = { ...englishSignMessages, ...messages }` and drives
`dir`/`lang` from `t.dir`/`t.lang` (previously a hardcoded `dir="ltr" lang="en"`), so the row mirrors
under RTL: tools on the right, Download on the left. Shlomi judged this on the built page and kept it,
same call as the dock mirroring above.

**What is left, by surface and file:**

- **Shapes menu and the signature popover**, both live inside `src/components/SignTool/SignToolbar.tsx`
  itself (`role="menu"` popovers cloned via `Popover.tsx`), not a separate component. Untranslated:
  the shapes menu's ellipse/rectangle/line labels and the saved-signatures dropdown, including
  "New Signature" and the per-signature "Delete signature" title/aria-label.
- **Signature and undo dialogs**, `src/components/SignatureDialog.tsx`, `src/components/UndoHistoryModal.tsx`.
- **The "Delete signature?" confirmation**, a `ConfirmDialog` instance inside
  `src/components/PdfSignTool.tsx` (`title="Delete signature?"`, `confirmLabel="Delete signature"`).
- **`src/components/EditorPageHeader.tsx`**, "Page {pageNumber}" and "Clear page", explicitly deferred
  in a comment there ("LOC-09 stage 1: 'Page N' and 'Clear page' stay English this stage").
- **The selected-element toolbar**, `src/components/ElementToolbar.tsx` (font-size/color/shape
  controls, e.g. "Decrease font size", "Ellipse", "Rectangle"), `src/components/FontPickerMenu.tsx`
  ("Search fonts"), `src/components/ElementResizers.tsx`, and
  `src/components/SignTool/nodes/TextNode.tsx`'s two placeholders ("Type your text",
  "Double-click to edit").
- **Notices**, `src/components/SignTool/ExportReadinessNotice.tsx`, `FontSupportNotice.tsx` (e.g.
  "Text needs attention"), and `src/components/SignTool/textMessages.ts`.
- **Screen-reader announcements**, the `setAnnouncement()` calls in `src/components/PdfSignTool.tsx`
  (about twenty, e.g. "Placed signature on page.", "Removed element.", "PDF signed successfully."),
  `src/editor/workspace/loadPdf.ts`, and `src/lib/useWorkspaceGestures.ts`. Four announcement templates,
  `toolActive`/`signToolActive`/`toolLocked`/`toolUnlocked`, are already in the `SignMessages` catalogue
  but not yet wired into any `setAnnouncement()` call (the catalogue's own header comment says so).
  Separately, and worth fixing as part of this stage rather than carrying forward:
  `src/lib/useWorkspaceGestures.ts` builds `setAnnouncement(\`Added ${tool}.\`)` and
  `logAction('add', 'ADD_SHAPE', pageIndex, \`Added ${tool}\`, ...)`, interpolating the raw tool id
  directly into announced copy. `.claude/rules/editor.md` is explicit: "`TOOL_COPY` owns every
  tool-facing string, visible and announced... Never interpolate a raw tool id into copy."

**Decided: the GitHub feedback template stays English** (issues are triaged in English; carried over
unchanged from LOC-09).

**Done means:** `sign` joins `LOCALIZED_TOOL_ISLANDS` (`src/i18n/localizedTools.ts`, currently
`new Set(['merge', 'compress'])`); the `data-tool-controls-english` sr-only disclosure
(`ToolPageLayout.astro`) disappears from `/he/sign/`; `/he/sign/` still passes the purity guard without
that exemption. The English catalogue (`englishSignMessages` and every hardcoded default above) stays
verbatim, so `/sign/` and every existing test are untouched.

### 3. Hebrew editions of the two compress-hub guides

**What exists.** Eight of ten Hebrew guides are live in `src/content/localized-pages/he/`
(`how-to-sign-a-pdf-on-{android,iphone,mac,windows}`, `install-pdf-app`, `offline-pdf-form-filler`,
`open-source-pdf-editor`, `sign-pdf-no-signup`), each through the normal draft, preview and review gate.

**What is left.** `pdf-wont-compress-to-100kb` and `photo-and-signature-size-for-forms` have no Hebrew
edition, so `/he/compress/` is the only Hebrew tool page whose guide cards are all still English. Both
guides teach portal-specific size limits (the English originals cite US/generic portals); a translation
that swaps language but keeps the American portal names is exactly the doorway pattern
`content-and-copy.md` rejects ("teach something verifiable, disclose the awkward fact"). Real Israeli
portal specifics, which government/education/employment portals impose a size cap and what the cap is,
are a prerequisite from Shlomi before either guide can be drafted; this is not optional research, it is
the page's actual content.

**Done means** both guides published in `src/content/localized-pages/he/`, cited to their Israeli
portals the way the English originals cite theirs, through the same gate the other eight used.

### 4. Home page sign-off

**What exists.** `src/content/localized-home/he.yaml` still carries `reviewer: 'Claude Sonnet 5'` and a
`reviewNotes` that says plainly this is an AI draft pending Shlomi's own read-through, not a native
review. Shlomi has since edited four of its strings live on `main` (the H1's "only" emphasis, the MIT
trust chip, the GitHub star ask, the Compress placeholder), but that pass did not touch the
`reviewer`/`reviewedAt`/`reviewNotes` fields themselves, so the file still does not say a native review
happened. The languages page (`docs/i18n-status/`) currently records the home cell as `published`, one
stage short of `reviewed`.

**Done means** Shlomi's actual read-through of the rendered `/he/` page, with `reviewer`, `reviewedAt`,
and `reviewNotes` updated to say so for real, and the languages page's home cell moved from `published`
to `reviewed` (edit the artifact, then sync `docs/i18n-status/data/i18n-status.json` per
`content-and-copy.md`'s procedure). The same sign-off applies to the Hebrew `FileDropzoneMessages` and
`RecentFilesMessages` objects in `src/i18n/toolMessages.ts`, and to the Hebrew `SignMessages` object
from item 2 above, all three still carrying their own "AI draft, not yet reviewed" comments.

### 5. Markdown twin for `/he/`

`src/pages/index.md.ts` renders the home page's markdown twin from `src/data/homeContent.js` directly,
with no locale parameter; it is not the `[locale]/index.astro` route's twin, it is the English `/`'s
twin only. `middleware.ts` negotiates `Accept: text/markdown` for every page, but nothing on the
`/he/` route serves one, so a markdown request against `/he/` falls through to the `/404.md` fallback,
same as before LOC-09. `src/pages/[slug].md.ts` (the tool/content/static-page twin) does not cover this
gap either: it is deliberately single-segment only (its own header comment), so a locale-prefixed route
like `/he/sign/` is already outside it, which is the broader version of this same gap. Recommending this
item stay in this ticket rather than spin off its own: it is the smallest piece of work here, one new
locale-aware markdown endpoint for the home route alone, not the general locale-prefixed twin problem.

## Decided, not to reopen

- The RTL-mirrored tool dock stays; no override for `.home-dock`'s automatic flexbox mirroring.
- HeroDemo is translated (item 1, shipped 2026-09-13) and its motion mirrors under RTL; both were
  Shlomi's calls on the built page. Not to be reopened as "keep it LTR".
- The GitHub feedback template inside the Sign editor stays English.
- The tool dock's title/description text is localized through `cardMessages.ts`
  (`getToolCardCopy(locale, slug)`, reused from `ToolCrossLinks.astro`), not by adding `gridTitle`/
  `gridDescription` to `TOOL_SOURCE_FIELDS` in `src/i18n/localizedTools.ts`, since `tools.js` is
  client-imported (`RecentFiles` reads it directly), so a translation bundle added there would ship to
  every visitor's browser regardless of locale. This is already shipped (LOC-09, `c33a404`/`18b1f06`);
  do not reopen it as a design question.
