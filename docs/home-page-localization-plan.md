> **Note:** the `CLAUDE.md` "UI & State Invariants" section cited below now lives in `.claude/rules/home-page.md`.

# Home page (`/`) localization design

Date: 2026-09-11. Scope: localizing the marketing home page (`/`, `src/pages/index.astro`) into Hebrew
(`he`) and future locales, so that `/he/` (and equivalents) resolve to a real, indexable, RTL-correct
edition instead of 404ing. This document does not cover `/sign/`, the ten standalone guides, or any
other tool page - those are fully specified in
[docs/app-documentation-localization-plan.md](./app-documentation-localization-plan.md) ("the Sign/guides
doc"), which explicitly scoped the home page **out** ("Sign home page" there means `/sign/` as a tool
hub, never `/`). This document supersedes nothing in that doc; it extends the same infrastructure to one
more page family that doc never touched, and flags the one place the two plans now have to agree (the
`x-default` / alternates contract, ยง6).

This is a design document, not a shipped feature or a task tracker. Execution state, once work begins,
belongs in `TODO.md`, following the same convention the Sign/guides doc uses.

## Evidence and limits

- This review is a reading of the actual working-tree source (`src/pages/index.astro`,
  `src/components/HeroDemo/*`, `src/components/FileDropzone.tsx`, `src/i18n/*`, `src/content.config.ts`,
  `src/pages/sitemap.xml.js`, `src/layouts/BaseLayout.astro`, `src/components/AppBar.astro`,
  `src/components/Footer.astro`, `src/components/RecentFiles.tsx`, `src/components/ConfirmDialog.tsx`,
  `src/components/OfflineProof.astro`, `src/data/homeContent.js`, `src/data/tools.js`,
  `src/pages/index.md.ts`, `src/lib/markdownRender.js`), not a browser audit, not a Lighthouse run, and
  not a Search Console pull. Every claim below cites a file and, where useful, a line range from this
  working tree; verify against current `main` before acting, since several of the components cited here
  (HeroDemo's beat map, the card-parallax CSS) are under active, frequent revision per their own comments.
- No demand evidence is asserted for a Hebrew (or any other) home page beyond what already motivated the
  existing Sign/guides work. This document does not repeat that audience analysis; see the Sign/guides
  doc's "Evidence and limits" section for its screenshot-count caveats, which apply with the same force
  here. Prioritization between "finish `/he/`" and any other locale/page work is out of scope for this
  document.
- No code was changed to produce this document. It is read-only investigation plus a design proposal.

## 1. Scope statement

**In scope:** `/` (English source) and `/he/` (first Hebrew edition), plus the general mechanism for any
future locale already registered in `src/i18n/documentationLocales.ts` (`hi`, `ar`, etc.) to get its own
`/<prefix>/` home edition later. "The home page" means exactly what `src/pages/index.astro` renders today:
the hero/launcher/dock/demo tour, the six `FeatureCard` sections below it (why-I-made-this, draft
persistence, offline/PWA install, FAQ, privacy/open-source, the closing "give it a try" card), and the
shared `Footer`.

**Out of scope / explicitly not re-litigated:**

- The "editor stays English" decision. Nothing on the home page mounts a PDF editor (`FileDropzone` only
  hands a file off to a tool page - `src/components/FileDropzone.tsx:30-43`), so this document never
  needs to revisit that boundary. It does, however, surface a **new** instance of the same boundary in a
  place the Sign/guides doc never had to consider: a confirmation dialog with file-replacement copy that
  today only exists in English (ยง2, `FileDropzone.tsx`).
- The locale-routing mechanism. This document assumes and reuses `src/i18n/documentationLocales.ts`
  (locale identity/direction/prefix/hreflang), `src/i18n/localizedTools.ts`'s pattern (not its code - the
  home page is not a tool), and the `src/pages/[locale]/[tool].astro` /
  `src/pages/[locale]/[contentPage].astro` route shape. It proposes one new sibling route,
  `src/pages/[locale]/index.astro`, following the same shape. No new locale list, no new prefix scheme,
  no cookie/IP-based redirect (the Sign/guides doc's "Page and selector decision" table already rejected
  those, ยง"Page and selector decision" there, and nothing about the home page changes that reasoning).
- Which locales to prioritize and in what order. The Sign/guides doc's rollout table (Hebrew first,
  Hindi pilot next, the rest gated on native review) is not re-derived here; ยง8 below assumes the same
  order for consistency but does not re-argue it.

**Does becoming localized change the Sign/guides doc's SEO contract?** No, with one clarification. That
doc's `x-default` logic lives per-page (`getLocalizedToolContext` in
`src/i18n/localizedTools.ts:147-189`, and the equivalent for guides) and is keyed by `(pageId, locale)`
pairs - it has no notion of "the home page" as a pageId at all today, and nothing in it reads
`src/pages/index.astro`. A localized home page is therefore a genuinely new alternates group, not an
extension of an existing one; it needs its own entry in `sitemap.xml.js` (ยง6) and does not touch
`getPublishedEditionPaths` or `LOCALIZED_TOOL_ISLANDS` (`src/i18n/localizedTools.ts:201,209-215`), both of
which are keyed by tool/guide page id and have no "home" slot to add. The one real interaction: once
`/he/` exists and is published, `/he/sign/`'s own alternates and `/`'s own alternates are independent
groups that happen to cross-link (home's tool dock links to `/sign/` in English today, ยง4) - nothing
requires them to merge, and this document does not propose that they should.

## 2. Complete inventory

Every piece of visible English text or English-only logic on `/`, in document order, with its
classification:

- **A** = already localizable via existing infrastructure (named)
- **B** = needs new translation infrastructure (a message catalogue, a prop, a content entry)
- **C** = hardcoded string or hardcoded-English logic with no locale mechanism today (the "airplane-mode
  bug" class of issue named in the task brief)

| # | Copy / behavior | File:line | Class | Notes |
|---|---|---|---|---|
| 1 | `<html lang>`/`dir`, canonical, OG/Twitter, alternates | `src/layouts/BaseLayout.astro:11,14,18,36,45` (consumed via `index.astro:31`) | **A** | `BaseLayout` already accepts `lang`, `dir`, `alternates`; `index.astro`'s `<BaseLayout title={title} description={description}>` call simply never passes them, so the English page silently defaults to `lang="en" dir="ltr"` with no alternates. Wiring is additive, not new. |
| 2 | `title`, `description`, `faq[]` (SEO/JSON-LD) | `src/data/homeContent.js:7-18` | **A**-shaped, **B** to populate | The object exists and is already the single source both `index.astro` (`SeoSchema`, `faq.map`) and `index.md.ts` read (`src/pages/index.md.ts:8`). It has no locale dimension yet - it is one object, not `{ en, he }`. A Hebrew edition needs a new source for these four fields (ยง5). |
| 3 | `homeContent.h1` | `src/data/homeContent.js:11` | **C**, dead weight | Defined but **never rendered**. `index.astro:62` hardcodes `<h1 id="home-heading">Free PDF tools that run <span>on your device</span></h1>` directly in the template rather than reading `homeContent.h1`; only `index.md.ts`'s Markdown twin uses the data field (`homeToMarkdown` reads `h1` - `src/lib/markdownRender.js:138-140`). This is an existing drift, not something this plan introduces, but it means today the HTML `<h1>` and the Markdown twin's `<h1>` line are two independently-maintained strings that happen to match. A localization pass must either fix this drift (make `index.astro`'s H1 read from `homeContent.h1`) or it will silently translate one and not the other. |
| 4 | GitHub star / MIT / "Works offline" trust chips | `index.astro:54-59` | **C** | Hardcoded anchor text (`Star us on GitHub`, `MIT licensed`, `Works offline`) and `aria-label`s, written directly as JSX children in `index.astro`, not sourced from `AppBar`'s `AppBarMessages`/`FooterMessages` catalogues at all (those cover `homeAriaLabel`/`onDevice`, not chip labels). No existing message key for any of these three strings. |
| 5 | `AppBar isHome` call with no `labels` prop | `index.astro:53` | **C**, silent fallback | `AppBar.astro` already accepts `labels?: AppBarMessages` (`homeAriaLabel`, `onDevice`) and has reviewed Hebrew values in `documentationShellMessages.he` (`src/i18n/toolMessages.ts:111-146`... - see correction below). `index.astro` never passes `labels`, so even after a `/he/index.astro` route exists, the app bar's "On-device" text and aria-label would keep defaulting to English unless the route is written to pass them. *(Correction: the Hebrew shell messages actually live in `src/i18n/documentationMessages.ts`, not `toolMessages.ts` - see ยง5's file list.)* |
| 6 | H1 + subhead: "Free PDF tools that run **on your device**" / "Merge, sign, split, redact and compress PDFs. No signup, no install, nothing leaves your device." | `index.astro:62-63` | **C** | Hardcoded prose, not sourced from `homeContent` (see row 3). Primary keyword copy - the Sign/guides doc's SEO-invariant table (CLAUDE.md's "SEO invariants") requires the H1 carry the primary keyword per page; a Hebrew edition needs its own reviewed keyword hypothesis, not a literal translation (same rule the Sign/guides doc already applies to guide titles). |
| 7 | `FileDropzone` (launcher tile + all its copy) | `src/components/FileDropzone.tsx` (whole file) | **C**, zero i18n hooks | Every user-facing string is a hardcoded literal: `'PDkef could not save this file on your device. Please try again.'` (:40), `'Choose one PDF here, or use Merge PDF below for several files.'` (:47), `'Please choose a PDF file.'` (:49), `'That recent file is no longer available in this browser.'` (:75), `'The sample could not be loaded. Please try again or choose your own PDF.'` (:128), `'Opening…'` / `'Choose files'` / `'or drop PDFs here'` (:172-174), `'Practice document · opens in Sign & Fill'` (:166), the `ConfirmDialog` title `'Open this instead?'` and `confirmLabel` `'Open it'` (:181), and the dialog body text `Opening … replaces your saved work in … That can't be undone.` (:186-187). The component takes **no** `messages`/`lang` prop of any kind - it is the least-prepared component on the page for localization, and it is also the **`client:load` island most exposed to the CLS/hydration hazards in ยง3**. |
| 8 | `RecentFiles` (recent-documents card) | `src/components/RecentFiles.tsx` | **C** | `'Recent files'` sr-only heading (:29), `` `Open bundled sample PDF, ${file.fileName}` `` / `` `Open recent PDF, ${file.fileName}` `` aria-labels (:54,65), `'just now'` (:89). `Intl.RelativeTimeFormat(undefined, …)` (:97) is the one exception - it already resolves against the *browser's* locale automatically, independent of the page's content locale, which is worth preserving rather than hardcoding to the page locale (a Hebrew-content visitor whose OS is set to English would otherwise get a mismatched "לפני 5 דקות" the OS never asked for). |
| 9 | `ConfirmDialog`'s own default props | `src/components/ConfirmDialog.tsx:44-45` | **B**, half-existing | `cancelLabel = 'Cancel'`, `closeLabel = 'Close dialog'` are English defaults, overridable via props - the component itself is locale-agnostic by design (the Sign/Redact tools presumably already override these, unverified in this pass since those tools are out of scope). `FileDropzone` never overrides them, so a localized home page would show a Hebrew dialog title/body with an English "Cancel" / "Close dialog" unless `FileDropzone` starts passing `cancelLabel`/`closeLabel`. |
| 10 | Tool dock (`homeTools.map`: icon, `gridTitle`, `gridDescription` tooltip) | `index.astro:82-92`, sourced from `src/data/tools.js` (e.g. `gridTitle: 'Sign & Fill PDF'` at :38, `gridDescription` at :39) | **C**, and structurally blocked | `tools.js`'s `gridTitle`/`gridDescription` fields are **not** in `TOOL_SOURCE_FIELDS` (`src/i18n/localizedTools.ts:35-48`: `seoTitle, seoDescription, schemaName, toolName, h1, subhead, ariaLabel, aboutHeading, aboutLead, freeNoteLead, steps, faq` - no `gridTitle`/`gridDescription`). This means even for the two tools that already have a published Hebrew edition today (`merge`, `compress` - `LOCALIZED_TOOL_ISLANDS` at `localizedTools.ts:201`), `mergeLocalizedTool` (`localizedTools.ts:65-71`) does not and cannot overlay a translated dock label, because the field isn't in the merge set. **The home page's tool dock would stay English-labelled even on a fully Hebrew `/he/` page, for every tool, unless this gap is closed** - see ยง5's open engineering decision. |
| 11 | `<HeroDemo />` scroll-driven demo: two full stories | `src/components/HeroDemo/HeroDemo.astro` (whole file, ~410 lines) | **C**, entirely hardcoded, and structurally hard | Every string is a literal in the `.astro` template: two `sr-only` narration paragraphs (:37-45, :261-265) describing the whole story for assistive tech and no-JS visitors; two `<h2>` captions ("Fill, **sign**, send it back." at :52, "Keep the **private** bits private." at :272) plus their "Scroll to explore" hint (:53,273); chat UI copy ("Maya's class parents" :79, the two chat bubble messages :82,84); the simulated PDF form's every label and value (`Field Trip Permission Slip`, `Room 12 is going to the Science Museum on Friday, May 14, from 8:00 AM to 3:30 PM.`, `Student's Name`/`Maya Chen`, `Parent/Guardian`/`Elena Chen`, `Emergency Contact`/`(555) 214-0193`, `Allergies / Medical`/`Peanut allergy`, both checkbox labels, `Sign below to give permission.`, `Parent or Guardian` :113-183); the share sheet (`Messages`/`Mail`/`More` :221,238,248); the second story's inbox (`Front Desk`, `Quick favor, need that bill on file`, `Team`, `Lunch on Friday?` :316-334); the bill's line items (`Account Holder`/`J. Alvarez`, `Service Address`, `Billing Period`, `Customer ID`, `Account No`, `Rate Plan`, `Meter Serial`, both meter readings, `Usage`, `Late Fee Note`/`Includes $12 reminder fee`, `Amount Due`, `Due Date` :347-377); the reply (`Here you go.`, `Send`, `Sent` :384-401); and every tool-chip label (`Text`/`Symbols`/`Sign`, `Blur`/`Blackout`/`Whiteout`/`Delete`, `Share` :115-117,341-344,193). None of it is data-driven - there is no `homeContent`/`heroDemoContent` object to translate; translating this means editing ~150 lines of `.astro` markup per locale (or building a message-catalogue layer that does not exist for this component at all today). See ยง3 for why this is also the highest-risk surface to touch, independent of the translation-volume problem. |
| 12 | ScrollDriver beat-map comments and constants | `src/components/HeroDemo/ScrollDriver.tsx` (whole file) | N/A (no visible copy) | Pure TypeScript/behavior, no user-facing strings. Included here because its physical-direction assumptions (`--story-slide` in ยง4) constrain what HeroDemo.astro's markup can say without a design decision, even though the driver itself has nothing to translate. |
| 13 | Why-I-made-this card (founder story) | `index.astro:104-146` | **C** | "Why I made this" kicker, "Simple PDF tools, made to share" heading, both origin-story paragraphs, the "Everything runs in your browser…" line, "Free Forever"/"No limits, no catch", "Private"/"Files never leave your device", "Open Source"/"Audit the code yourself", and the "Shlomi" byline link text. This is the exact origin narrative CLAUDE.md's "Origin" section says every messaging decision traces back to - a Hebrew edition needs a native-voice retelling, not a literal translation (CLAUDE.md's own voice rules: "no em dashes", modest/warm register - a mechanical translation risks losing the register entirely). |
| 14 | Draft-persistence card | `index.astro:149-213` | **C** | "Privacy & Convenience" kicker, "Close the tab. Keep your progress." heading, the autosave explanation, "Autosaved to device" pill, and the "Available in **Sign & Fill** and **Redact & Blur**…" line. This is the flagship differentiating feature the project memory (`project_draft_persistence_feature.md`) says to emphasize in SEO copy - worth flagging as high-value to translate well rather than mechanically. |
| 15 | Offline/PWA install card | `index.astro:215-291` | **C** | "Your PDF tools, even offline" heading and lead; three tab labels (`Chrome & Edge`, `Safari (iOS)`, `Safari (macOS)`); all three numbered install-step sequences (9 `<li>`s total); the tab-switching `<script>` itself has no copy (:293-317, pure behavior). |
| 16 | FAQ card | `index.astro:319-333`, data from `homeContent.faq` (`src/data/homeContent.js:12-17`) | **A**-shaped, **B** to populate | Same situation as row 2: the render path (`faq.map` at :326) already reads from `homeContent`, so a Hebrew `homeContent` object would flow through with no template change. The four Q/A pairs themselves need translation + review. |
| 17 | Privacy/open-source card | `index.astro:335-354` | **C** | "Transparent & Secure" kicker, "Private by design. Open to inspect." heading, "Privacy"/its paragraph, "Open source"/its paragraph (contains a `<a>` to GitHub and one to `/licenses/` - an internal link needing the trailing-slash rule from CLAUDE.md's URL-canonicalization section if ever moved into a locale-prefixed content system), "Read the code on GitHub", "MIT Licensed" pill. |
| 18 | Closing "Give it a try" card | `index.astro:356-366` | **C** + **A** (via row 20) | "Give it a try." heading, "Back to your workspace ↑" link text. Wraps a second `<FileDropzone final>` instance - see row 7/20. |
| 19 | `OfflineProof` live status line | `src/components/OfflineProof.astro:53` | **C** | `"You're offline right now. It still works."` is a literal string inside a non-`is:inline` `<script>` (CSP-relevant per CLAUDE.md's CSP section - any change to this script's content requires a `build && preview` CSP pass, not just a text swap). Renders nothing until `navigator.onLine` is false, so it is invisible on most page loads and easy to forget when auditing visible copy. |
| 20 | `Footer` | `src/components/Footer.astro`, rendered at `index.astro:367` | **A**, already fully wired | Unlike every other component on this page, `Footer.astro` already accepts `labels?: FooterMessages`, `variants?: Variant[]`, `locale?: string` (`Footer.astro:14-24`) and already renders `<DocumentationLanguageSelector>` (`Footer.astro:44`). `index.astro:367` calls `<Footer />` with **no props at all** - so today it silently renders every fallback default (`'Built with'`, `'by'`, `'GitHub'`, `'Report a bug'`, `'Feedback & ideas'`, `'Licenses'`, `'About'`, `'Contact'`, `'Privacy'` - the `??` fallbacks at `Footer.astro:46-54`) and the language selector renders nothing (0 or 1 variants). This is the **one component on the whole page that needs no new infrastructure** - it needs only to be called with `labels={getDocumentationShellMessages(locale)}`, `variants={...}`, `locale={locale}` from the new route (ยง5, ยง Footer as the language-selector anchor). |
| 21 | Second `FileDropzone` instance (`final` variant) inside the closing card | `index.astro:364` | Same as row 7 | Renders `'Practice document · opens in Sign & Fill'` copy specifically (`FileDropzone.tsx:166`), which additionally hardcodes the destination tool name ("Sign & Fill") in English regardless of what a localized Sign edition would call itself. |
| 22 | `data-home-demo` `aria-label`: "How PDkef works, shown as two short stories" | `HeroDemo.astro:14` | **C** | Same file/class as row 11, called out separately because it is an `aria-label`, not visible text, and easy to miss in a visual-only copy audit. |

**Summary of classification:** of the ~20 distinct copy surfaces, exactly **one** (`Footer`) needs zero new
infrastructure. Two (`homeContent`'s title/description/FAQ, and the h1/dock-label drift in rows 3 and 10)
are "shaped right but need a locale dimension added." Everything else - including the highest-value
content (the founder story, the draft-persistence pitch) and the highest-effort content (the entire
`HeroDemo`) - is presently hardcoded English with no locale mechanism at all.

## 3. CLS / hydration risk analysis

CLAUDE.md's "UI & State Invariants" section documents several pixel-measured, previously-shipped
regressions on this exact page. Localizing copy touches the DOM these invariants depend on, so each
sensitive component needs its own risk statement rather than a blanket "be careful."

### FileDropzone (`client:load`, hydration-parity contract)

**What the invariant protects:** `FileDropzone.tsx` is `client:load` specifically so its markup exists in
server-rendered HTML (the dashed picker tile, "Choose files", the recents card) rather than popping in
after hydration - CLAUDE.md's own words: "a `client:only` island emits no HTML at build time... visibly
arrived after the page had painted." That safety depends on **the server's first-render output and the
client's first-render output being byte-identical**, which is why `recents` starts `null` and is only
read from browser storage inside the mount effect (`FileDropzone.tsx:24,116-122` - comment at :16-23
explains the hydration-mismatch-repair mechanism that caused duplicate tiles in `203b204`).

**What localizing its copy could break, concretely:** none of the strings in `FileDropzone.tsx` (row 7)
participate in that hydration-parity mechanism directly - they are static literals, not derived from
`recents`. Swapping `'Choose files'` for `'בחירת קבצים'` via a `messages` prop passed from the server does
not reintroduce the `null`-then-populated hydration mismatch, **provided the messages prop itself is
computed at build/request time from the URL locale and is identical on server and first client render** -
which it will be, since it comes from the route's static params, not from browser storage. The actual risk
is narrower and different: **string length**. Hebrew renders the picker tile's `<strong>{busy ? 'פותח…' :
'בחירת קבצים'}</strong>` and the `<span>` "or drop PDFs here" equivalent inside a tile whose row is
explicitly **viewport-height-derived, not content-derived** (CLAUDE.md: "`.workspace-launcher` is
`grid-area: launcher`... sits in a `1fr` row inside a viewport-height box... so `FileDropzone` arriving
cannot change the *row's* size"). That guarantee is about the *row*, not the *tile's internal content*: if
a translated string wraps to a second line where the English original fit on one, the tile's own height
can still grow within its allotted row - CLAUDE.md's own worked example for this exact failure mode is the
3-vs-4-recents case ("the row's own available space still lets its content push the picker tile down").
Hebrew averages meaningfully different character/word widths than English (shorter for some strings,
longer for others - there is no single correction factor), so **any Hebrew string substituted into
`FileDropzone`'s fixed-shape buttons must be checked for wrap behavior against the same 180px/132px
(desktop) and mobile grid dimensions `FileDropzone.module.css` already defines**, not assumed safe because
the English original fit.

**What must be respected:** (1) the `null`-then-populate `recents` pattern must not be touched by this
work - a locale prop is a build-time constant, not new client-read state, so it should not need to touch
that effect at all if implemented as a plain prop; (2) any new Hebrew string must be checked in a real
browser against `FileDropzone.module.css`'s `.tile`/`.launcher`/`.final` dimensions and the
`:has([data-home-recents] li:nth-child(3))` compaction rule CLAUDE.md documents was already a CLS source
once (fixed by making the compact shape unconditional - re-verify that fix's premise, "the fallback
already guarantees at least one item," still holds when the fallback's *label* text changes length); (3)
this is real-browser verification, not something `npm test`/jsdom can prove, per CLAUDE.md's own
"Vacuous geometry tests" and "Some editor bugs require a browser, not jsdom" hazards.

### HeroDemo / ScrollDriver (scroll-linked story, `1116svh` span)

**What the invariant protects:** the entire tour is pinned to an exact `1116svh` of scroll travel
(`index.astro:538`), with `SIGN_END`/`CROSSFADE_START`/`CROSSFADE_END` in `storySplit.ts` (referenced,
not read in this pass - imported at `ScrollDriver.tsx:2`) expressed as **fractions of that span**. Nothing
about translating HeroDemo's *text* changes that span - the beats in `ScrollDriver.tsx`'s `TRACKS` array
(lines 39-117) are all scroll-progress fractions (0 to 1), not pixel or character measurements, so a
longer or shorter Hebrew caption does not, by itself, desynchronize the beat map. This is a *lower* risk
than `FileDropzone`'s, and the plan should not overstate it.

**What could break it:** the caption text (`HeroDemo.astro:52`, `:272`) sits inside `.caption`/`.caption-
copy` elements whose layout is driven by CSS `--caption-opacity`/`--story-opacity` custom properties
written by `ScrollDriver.tsx:222-223`, not by the caption's own content size - so far, safe. The actual
hazard is the same class as `FileDropzone`'s: `.caption-copy` and the simulated phone screen's fixed-size
text fields (`Student's Name`, `Maya Chen`, etc. at `HeroDemo.astro:126-151`) are drawn inside **fixed-
pixel-width overlays** - the code comment at `ScrollDriver.tsx:44-62` explains exactly why: "a PDF page
cannot reflow - pdkef draws form fields as fixed-position overlays on a raster that never moves,"
implemented as "constant-width reserved spaces, an absolutely positioned value overlay revealed via
clip-path." **That constraint is about the simulated *PDF form fields* specifically (rows within
`.parent-fields`), and it is a hard one**: a translated value like a Hebrew name or the trip-detail
sentence must fit the same reserved pixel width the English "Maya Chen" / "Room 12 is going to the Science
Museum on Friday, May 14, from 8:00 AM to 3:30 PM." sentence was sized for, or the reveal clip-path will
either cut off the translated text or expose empty space around it - and because this reveal is driven by
`clip-path`, not by natural text flow, **it will not visibly "break" as a layout shift (CLS)**; it will
silently truncate or under-fill, which is arguably worse because no CLS-measuring tool catches it. Any
Hebrew translation of the simulated form content must be treated as **fixed-width copy**, sized/tested
against the actual overlay boxes, not translated as ordinary prose.

**RTL adds a second, independent hazard on top of that (see ยง4): the whole demo's animation grammar
is physically LTR** (`transform: translateX(var(--story-slide, 0%))` at `HeroDemo.module.css:28`, with
values of exactly `-100%`/`100%` computed in `ScrollDriver.tsx:219`), so this is not just a text-fit
problem in Hebrew - it is a question of whether the demo's *direction of motion* should mirror for an RTL
reader at all, which is a design decision, not an engineering one. See ยง4.

**What must be respected:** the `1116svh` span and its `SIGN_END`/`CROSSFADE_START`/`CROSSFADE_END`
fractions must not be touched by a copy change; per-field fixed-width constraints in the simulated PDF
form must be measured and respected per locale; and (per ยง4) the direction-of-motion question needs an
explicit answer before any Hebrew HeroDemo copy ships, not an implicit "just translate the strings and see."

### `--home-nav-height` (runtime measurement)

**What the invariant protects:** `AppBar.astro`'s bar renders at 56.5px in a real browser (56px content +
0.5px hairline border), not the 56px the `h-14` utility implies; `homeWorkspace.ts` measures it at runtime
and corrects `document.body`'s `--home-nav-height` custom property only when a browser's rendering
disagrees with the CSS-authored default (CLAUDE.md's own explanation, `index.astro:376-390`'s inline
comment).

**What localizing could break:** nothing text-related. This measurement is keyed to the bar element's
*rendered height*, not its content, and the app bar's content (logo + wordmark + trust chips) does not
change height when its text changes language - only its *width* would change (e.g., Hebrew "PDkef"
wordmark stays Latin per CLAUDE.md's brand-name-stays-as-is rule, so this is moot for the wordmark itself,
but a Hebrew "On-device" chip or the currently-hardcoded "Works offline"/"MIT licensed"/"Star us on
GitHub" chips, row 4, could be longer or shorter). **This is a non-issue for `--home-nav-height` itself**
(height, not width), but it is a live issue for the trust-chip row's *wrapping* behavior at the narrow
breakpoints `index.astro`'s `<style>` block already special-cases (`max-width: 720px` collapses chips to
icon-only, `index.astro:753-771`) - a Hebrew chip label needs the same icon-only fallback to still read
correctly, and RTL flips which side the icon sits on relative to the text (logical properties already used
in a few places, e.g. `ms-2` at `:159`, but chip padding at :475/:761 needs auditing for `padding-inline`
vs `padding-left`/`padding-right` before assuming it "just works" under `dir="rtl"`).

### Picker-tile collapse (`:has()` selector)

Already covered under FileDropzone above; restated here because CLAUDE.md documents it as its own
named historical incident (0.0487 CLS at 3 recents, fixed by making the compact shape unconditional). The
fix's safety argument ("the fallback already guarantees at least one item... regardless of what the real
cache holds") does not depend on string length, so this specific historical bug is **not** reopened by
translation - flagged here only so a reviewer checking this list against CLAUDE.md's own hazard doesn't
have to re-derive that it's covered.

## 4. RTL-specific home page concerns

The Sign/guides doc's RTL section (its "RTL and accessibility" section) covers document-flow prose:
logical margins/padding/alignment, isolating inline English terms, native-name marking. That guidance
applies here too and is not repeated. This section covers what is **new** because the home page has
spatial/visual layout the guides never had.

### 4.1 The tool dock reading as "a macOS dock"

CLAUDE.md is explicit that `.home-dock` is designed to read as a macOS dock, and that this is load-bearing
for how an experienced visitor uses the page ("an experienced visitor uses it to jump straight to the
tool they came for"). A dock's icon order currently follows `tools.js`'s registry order (with Compress
manually reordered to third - `index.astro:23-28`) rendered `flex`/left-to-right. Under `dir="rtl"`, CSS
flexbox reverses the *visual* order of `flex-direction: row` automatically (row becomes right-to-left)
without any code change - so the dock's icon order will mirror automatically. **Open question, not
resolved by reading the code:** is a mirrored dock order (rightmost = first tool) the correct RTL
behavior for a UI element the product deliberately wants to read as a familiar OS affordance, or does a
"dock" specifically carry LTR-fixed positional memory (e.g., a returning Hebrew-reading visitor who
learned "Sign is on the far left" in a mirrored layout now finds it on the far right)? This is a product
design call, not something the codebase answers - flagged as an open question in ยง9.

### 4.2 The scroll-driven demo's direction of motion

This is the most concrete open question in this document, with direct code citations:

- `ScrollDriver.tsx:219`: `const storySlide = isFirst ? -100 * crossfade : 100 * (1 - crossfade);` - the
  first story (Sign) always slides out **toward negative X** (left, in a physical/LTR coordinate system)
  as the second story (Blur/Redact) slides in **from positive X** (right). This is a `transform:
  translateX()` (`HeroDemo.module.css:28`), a **physical**, not logical, CSS property - it does not
  participate in `dir="rtl"` mirroring the way `margin-inline-start` or `text-align: start` would.
  Under `dir="rtl"` with no code change, the demo would keep sliding in exactly the same physical
  direction it does today (story one exits left, story two enters from the right) - visually
  contradicting the "reading order" a Hebrew page establishes everywhere else on the same page (headline,
  captions, the FAQ grid, the founder-story card - all of which *do* use logical properties or plain block
  flow that naturally mirrors).
- Within each story, individual beats also move physically: `HeroDemo.module.css:405,410,418` use
  `translateX(calc(...))` for a chat-panel slide, a share-sheet reveal, and a send-button fly-out, each
  keyed to a specific percentage and direction tuned for the English story's reading order (e.g., a chat
  bubble arriving as if the reader's eye moves left-to-right through it).
- Chat bubbles use `align-self: flex-end`/`flex-start`-style physical alignment (`bubble-in`/`bubble-out`
  classes at `HeroDemo.module.css:481,492`, `justify-content: flex-end` at `:1320`) to distinguish
  "incoming message" from "the user's own sent message" - a convention every chat app on both LTR and RTL
  phones actually mirrors (an RTL chat UI puts the user's own messages on the *left*, not the right, so
  mirroring here would be **correct and expected**, unlike the story-slide question above which has no
  such existing convention to defer to).

**This is a genuine, unresolved design question this document cannot answer from the code alone.** Three
options exist, none clearly implied by anything currently in the repository:

1. **Mirror everything** (swap every physical value to its RTL-logical equivalent: story one exits right,
   story two enters from the left, chat bubbles flip which side is "incoming" vs "outgoing"). Correct by
   the chat-UI convention above, but a nontrivial rewrite of `ScrollDriver.tsx`'s sign/multiplier logic
   and every physical-direction rule HeroDeom.module.css uses (not a small find/replace - the module CSS
   file is ~1400 lines and this document did not audit every physical-direction declaration in it, only
   the ones a targeted grep surfaced: `HeroDemo.module.css:28,405,410,418,481,492,1287,1320`).
2. **Keep it physically LTR regardless of page direction** (the demo is a *simulation of a phone screen*,
   and phone chat UIs a Hebrew-reading person actually uses are not uniformly mirrored either - RTL
   support varies by app). Cheapest to ship, but risks reading as visually "wrong" or foreign on an
   otherwise fully-RTL page, and contradicts the chat-bubble convention noted above.
3. **Simplify or skip translating the demo for non-English locales**, shipping the Hebrew home page with
   the demo left in English (with an `lang="en"` island, similar in spirit to how the Sign/guides doc
   isolates the English editor) until a design decision is made. This avoids shipping something wrong
   while not blocking the rest of the page. This document lists it as a real option in ยง9, not a
   recommendation - see the Sign/guides doc's own precedent for isolating specifically-not-yet-ready
   content behind an explicit English label rather than a bad translation.

No option is recommended here; this needs a product decision before implementation, which is why it is
also listed as an open question in ยง9 rather than resolved in the engineering spec (ยง5).

### 4.3 Grid-template-areas and logical direction

`.home-hero`'s desktop grid (`index.astro:439-450`) is defined with explicit column tracks (`content-
start`/`content-end` named lines) and a `grid-template-areas` string placing `launcher` left-of-center and
`demo` right-of-center (`". launcher . demo ."`). CSS Grid's `grid-template-areas` **does** respect
`direction` for `row`-cardinal but the *named area string itself* is authored left-to-right regardless of
document direction unless the grid container's `direction` is RTL, in which case the *rendered* column
order mirrors automatically (this is standard, well-supported CSS Grid behavior, not a hazard) - so unlike
the demo's `translateX()` transforms, **the grid arrangement itself should mirror correctly under
`dir="rtl"` with no extra work**, putting the demo on the visual left and the launcher on the visual right
for a Hebrew reader. This is called out explicitly so an implementer does not assume the whole layout needs
manual RTL overrides - only the demo's *internal* animation direction (ยง4.2) does.

## 5. Engineering implementation specification

### 5.1 Route

Add `src/pages/[locale]/index.astro`, sibling to the existing `src/pages/[locale]/[tool].astro` and
`src/pages/[locale]/[contentPage].astro`. This is a **new** route file, not an extension of either existing
one - Astro's file-based routing has no single-segment vs. two-segment ambiguity here (`/he/` matches
`[locale]/index.astro` exactly; `/he/sign/` matches `[locale]/[tool].astro`), so no collision handling is
needed beyond what `getStaticPaths` already does for the sibling routes.

**A real gap this surfaces:** `documentationPath(pageId, locale)` in `src/i18n/documentationLocales.ts:42-
46` always produces `/<prefix>/<pageId>/` (or `/<pageId>/` for English) - it has no way to express "the
locale root, no pageId." Home needs its own path helper, e.g. a `documentationHomePath(locale)` returning
`record.prefix ? '/${record.prefix}/' : '/'` - a two-line addition alongside `documentationPath`, not a
redesign, but it must be added; calling `documentationPath('', locale)` today would produce the wrong
`/he//` (empty pageId segment) rather than `/he/`.

### 5.2 Content source and publish gate

Following the `localizedTools`/`localizedPages` pattern in `src/content.config.ts` (toolFields/
localizedTools at :243-284, localizedPages at :190-221) exactly: a new `localizedHome` collection,
`src/content/localized-home/{locale}.yaml` (one file per locale - there is exactly one home page per
locale, unlike guides/tools which are keyed by `pageId`, so no `pageId` field is needed, only `locale`).
Schema mirrors the existing `superRefine` gate: `status: draft|published`, `sourceHash` (fnv1a64 of the
normalized English source, same `documentationSourceHash` function reused from
`src/i18n/documentationFreshness.ts`), and `reviewer`/`reviewedAt`/`reviewNotes` required when
`status: published` - identical mechanism, different collection.

**What goes in the schema (the English-source field list this hashes against, mirroring
`TOOL_SOURCE_FIELDS`):** `title`, `description`, `h1`, `subhead` (rows 2, 6 from ยง2's inventory - promote
`homeContent.js` to have real subhead/h1 fields that are actually rendered, fixing the row-3 drift as part
of this work rather than translating a drifted state), `faq[]` (row 16), the trust chips' three strings
(row 4), the founder-story card's kicker/heading/two paragraphs/tagline and its three feature-pill
labels+sublabels (row 13), the draft-persistence card's kicker/heading/paragraph/pill/availability line
(row 14), the offline-install card's heading/lead/three tab labels/nine step strings (row 15), the
privacy/open-source card's kicker/heading/two sub-cards' heading+paragraph+pill (row 17), the closing
card's heading and back-link text (row 18). This is a **single large YAML file per locale** (roughly 35-40
distinct strings), not split across multiple collections - there is only one home page, so there is no
equivalent of "one guide per topic" to shard it by.

**Explicitly not in this schema:** `HeroDemo`'s ~150 lines of markup (row 11) and `FileDropzone`'s runtime
strings (row 7) - both need their own mechanism (ยง5.3, ยง5.4), not a YAML content field, because both are
rendered by components that take props/markup, not a flat string list a content-collection schema can
validate the same way (HeroDemo's copy is interleaved with SVG/layout markup; FileDropzone's strings are
consumed by a Preact island, not an Astro template).

### 5.3 Message catalogue for the shell-adjacent pieces already prop-driven

`Footer` (row 20) needs no new catalogue - it already resolves through `getDocumentationShellMessages` /
`DocumentationShellMessages` (`src/i18n/documentationMessages.ts:171-175`). `AppBar` (row 5) likewise
already has `AppBarMessages` (`Pick<DocumentationShellMessages, 'homeAriaLabel' | 'onDevice'>`,
`documentationMessages.ts:63`) - the new route just needs to pass `labels={getDocumentationShellMessages
(locale)}` where `index.astro` today passes nothing.

The three trust-chip strings (row 4: "Star us on GitHub", "MIT licensed", "Works offline") already have
catalogue keys - `starOnGithub`, `mitLicensed`, `worksOffline` in `DocumentationShellMessages`
(`src/i18n/documentationMessages.ts:52-54`), with reviewed Hebrew values already present in
`hebrewMessages` (`documentationMessages.ts:140-142`: תנו כוכב ב-GitHub / רישיון MIT / עובד גם בלי אינטרנט).
Per that file's own doc comment, these are `ToolPageLayout.astro`'s app-bar trust chips (:51) - i.e. they
already exist for **tool** pages. `index.astro:54-59` does not read this catalogue at all; it hardcodes the
same three concepts as inline JSX with its own English strings, so the home page's chips and the tool
pages' chips are today two independently-maintained copies that happen to read the same in English and
could silently drift (confirm by diffing `index.astro`'s chip text against `ToolPageLayout.astro`'s use of
these keys before assuming they currently match verbatim). **The fix here is not "add new keys," it's
replacing `index.astro:54-59`'s hardcoded chip JSX with the same catalogue-driven pattern
`ToolPageLayout.astro` already uses** - zero new infrastructure, just routing the home page onto the
infrastructure the tool-page work already built and reviewed.

### 5.4 FileDropzone messages prop (new infrastructure)

`FileDropzone.tsx` needs a `messages` prop of a new `FileDropzoneMessages` interface (in
`src/i18n/toolMessages.ts`, alongside `MergeMessages`/`CompressMessages`, following the exact `formatMessage`/`{placeholder}` convention already established there), covering every string in ยง2 row 7-9: the handoff-failure message, the multi-file-picked message, the not-a-PDF message, the stale-recent-file message, the sample-load-failure message, `Opening…`/`Choose files`/`or drop PDFs here`, the practice-document caption (with the destination tool name parameterized rather than hardcoded "Sign & Fill" - row 21's finding), and the confirm-dialog title/body/`confirmLabel` plus explicit `cancelLabel`/`closeLabel` overrides (closing gap in row 9). `FileDropzone` is used from **two** places on the home page (`index.astro:80,364`, `toolTarget="sign"` both times) plus potentially other tool pages' own launchers if any exist outside this page's scope (not verified in this pass - grep `<FileDropzone` repo-wide before assuming home is the only caller) - a locale-unaware caller must keep working (default to English messages) so this is an additive, optional prop, not a breaking signature change.

`RecentFiles.tsx` (row 8) needs the same treatment, a smaller `RecentFilesMessages` (the sr-only heading, the two aria-label templates, `'just now'`) - passed through from `FileDropzone` since `RecentFiles` is only ever rendered by it (`FileDropzone.tsx:132`).

### 5.5 HeroDemo (largest open item, deliberately not fully speced here)

Given ยง4.2's unresolved direction-of-motion question, this document does **not** propose a specific
data-shape for HeroDemo's translated copy - doing so before that design decision would bake in an
assumption ("mirror" vs "keep LTR" vs "skip") that changes the shape of any content model. What can be
specified regardless of that decision: **whichever copy layer is built, it should follow the same
"strings extracted to a typed object, defaults to English, validated by a build-time check" shape every
other component here uses** - not a fork of the whole `.astro` file per locale (which would reintroduce
exactly the "eight near-identical `.astro` files" problem CLAUDE.md's content-pages section already
solved once and explicitly warns against repeating - "The SEO landing pages are a content collection, not
eight page files"). Once ยง4.2 is resolved, this section should be expanded into a real spec as a
follow-up to this document, not folded into it speculatively.

### 5.6 Layout/props plumbing summary

| Prop | Already exists on | New for home route? |
|---|---|---|
| `lang`, `dir`, `canonical`, `alternates`, `noindex` | `BaseLayout.astro:11,14,18` | No - just needs to be passed from the new route, same as `[tool].astro`/`[contentPage].astro` already do |
| `labels` (shell messages) | `AppBar.astro:23`, `Footer.astro:15` | No |
| `variants`, `locale` (language selector) | `Footer.astro:21-24` | No |
| Home-specific content object (`title`/`description`/`h1`/faq/cards) | `homeContent.js` (partial, English-only) | Yes - needs a locale dimension (ยง5.2) |
| `messages` (FileDropzone/RecentFiles) | Nothing today | Yes (ยง5.4) |
| HeroDemo copy layer | Nothing today | Yes, deferred pending ยง4.2 (ยง5.5) |

## 6. SEO contract

Mirrors the Sign/guides doc's contract (self-canonical, reciprocal alternates, `x-default`, sitemap
membership only for published pages) with the home-page-specific mechanics:

- **Canonical:** `/he/` is self-canonical, exactly as `/sign/` stays `/sign/` and is never redirected to
  an `/en/` prefix (Sign/guides doc, "SEO publication contract" section) - same rule, home page included.
- **Alternates:** today `src/pages/sitemap.xml.js`'s home entry (`:60`) has **no** `alternates` key at
  all - unlike every tool entry, which goes through `toolAlternates(slug)` (`sitemap.xml.js:44-52`, the
  exact function to model a new `homeAlternates()` on). Add a `homeAlternates()` following that function's
  shape: `[{ hreflang: 'en', href: base + '/' }, ...publishedHomeEditions.map(...), { hreflang: 'x-
  default', href: base + '/' }]`, gated the same way (`if (editions.length < 2) return []` - no alternate
  annotations until a second published edition exists, matching the existing rule that a single-edition
  page advertises no alternates at all).
- **Sitemap membership:** the home entry in `sitemap.xml.js` gets a `homeAlternates()` call once Hebrew
  publishes; the new `/he/` URL itself needs its own `<url>` entry, following the `publishedLocalizedPages`
  pattern already used for guides (`sitemap.xml.js:70,90-95`) - reading from the new `localizedHome`
  collection (ยง5.2) filtered to `status === 'published'`.
- **`verify-seo.js`:** its hreflang-reciprocity checks (`scripts/verify-seo.js:158-178`) operate generically
  over every `link[rel=alternate][hreflang]` found in built HTML (`:69`) - they are not page-type-specific,
  so a localized home page should be caught by the existing checks with no code change to that script,
  **provided** the new route actually renders the alternate `<link>` tags via `BaseLayout`'s existing
  `alternates` prop (ยง5.1/5.6) rather than a bespoke mechanism. Verify this assumption once the route
  exists rather than trusting it from this reading alone - `verify-seo.js` was not exhaustively read in
  this pass beyond the alternates section cited.
- **Publish gating:** same mechanism as `LOCALIZED_TOOL_ISLANDS`/`getPublishedEditionPaths` conceptually
  (a draft never appears in the sitemap, never gets alternate tags, gets `noindex` - the pattern already
  proven at `[tool].astro:86-87` `alternates={context.preview ? [] : context.alternates}`,
  `noindex={context.preview}`), applied to the new `localizedHome` collection's `status` field. No new
  concept is needed here; ` getLocalizedToolVariants`'s draft-filtering pattern (`localizedTools.ts:130`)
  is the direct model, just against one collection with no per-page-id dimension.
- **Markdown twin (`index.md.ts`):** out of scope to fully spec here, but flagged: **no locale-aware
  `.md.ts` route exists for *any* localized page today** - `src/pages/[slug].md.ts`, `index.md.ts`,
  `404.md.ts` are all English-only, and this is a pre-existing gap in the LOC-02 work generally, not
  something this document's scope introduces or is obligated to fix. A `/he/` visitor sending `Accept:
  text/markdown` today would presumably fail through `middleware.ts`'s `/404.md` fallback (per CLAUDE.md's
  Markdown-negotiation section) rather than get a Hebrew Markdown twin. Listed as a non-goal in ยง9 rather
  than specced, since fixing it is a cross-cutting LOC concern broader than the home page alone.

## 7. Translation content

Per this document's constraints, no full Hebrew marketing copy is authored here - a native-reviewer pass
is required before anything in this section could publish, mirroring the Sign/guides doc's own workflow
(product-owner-approved English source → translator draft → native reviewer → engineer check → publish).

### 7.1 Terminology to reuse (grepped from existing reviewed Hebrew strings, not invented fresh)

| Concept | Existing Hebrew term | Source |
|---|---|---|
| "On-device" / local processing | עובד מקומית | `documentationMessages.ts:113` (`hebrewMessages.onDevice`) |
| "Language" (selector label) | שפה | `documentationMessages.ts:114` |
| "Frequently asked questions" | שאלות נפוצות | `documentationMessages.ts:119` |
| "How it works" | איך זה עובד | `documentationMessages.ts:126` |
| "Free for everyone" | חינם לכולם | `documentationMessages.ts:127` |
| Open-source note (full sentence, reusable near-verbatim for the home page's own open-source card) | "הקוד פתוח ברישיון MIT, אז כל אחד יכול לקרוא אותו, לעשות לו fork ב-GitHub או לשתף אותו. כלים פשוטים ל-PDF צריכים להיות חינם לכולם." | `documentationMessages.ts:128` |
| "Star us on GitHub" | תנו כוכב ב-GitHub | `documentationMessages.ts:140` |
| "MIT licensed" | רישיון MIT | `documentationMessages.ts:141` |
| "Works offline" | עובד גם בלי אינטרנט | `documentationMessages.ts:142` |
| "This tool's buttons and menus are still in English" (the isolation-notice pattern, reusable for HeroDemo per ยง4.2 option 3) | הכפתורים והתפריטים של הכלי עדיין באנגלית | `documentationMessages.ts:140` |
| "Everyone runs on your device, free, with nothing uploaded" register | כל אחד מהם רץ על המכשיר שלכם, בחינם, בלי להעלות שום דבר | `documentationMessages.ts:125` (`crossLinksSubhead`) - closest existing precedent for the founder-story card's privacy-at-human-altitude voice (CLAUDE.md's voice rule 4) |

No Hebrew string for "sign up," "no account," "crash recovery," "offline," "PWA/install," or any of the
founder-story-specific vocabulary ("errand," "consent form," "paywall") exists yet in the reviewed
catalogues grepped for this document - a translator drafting the home page's founder story and PWA-install
card is working from a blanker slate than the FAQ/trust-chip strings above, and should be told so rather
than assume more precedent exists than actually does.

### 7.2 Illustrative unreviewed drafts (samples only - not for publication)

The following are draft candidates for the two lowest-risk, highest-visibility strings (the H1 and
subhead), offered as illustrative samples the way the Sign/guides doc's own JSON draft files do, **not**
as reviewed copy:

| Field | English (source, corrected per row 6) | Draft Hebrew (unreviewed) |
|---|---|---|
| H1 | Free PDF tools that run on your device | כלי PDF חינמיים שרצים על המכשיר שלכם |
| Subhead | Merge, sign, split, redact and compress PDFs. No signup, no install, nothing leaves your device. | מיזוג, חתימה, פיצול, טשטוש וכיווץ קבצי PDF. בלי הרשמה, בלי התקנה, שום דבר לא יוצא מהמכשיר שלכם. |

These two strings are offered as samples specifically because they are short, carry no fixed-width layout
constraint (unlike HeroDemo's form-field content, ยง3), and closely parallel phrasing already reviewed
elsewhere in the FAQ/trust-chip table above. Everything else in ยง2's inventory - the founder story above
all - needs a native reviewer's own voice, not a mechanical rendering of the English, per CLAUDE.md's
"Product, voice & copy" section and the Sign/guides doc's translation-workflow rules (native reviewer
required, "AI drafts are not native review").

## 8. Rollout / acceptance gates

Scoped to `/` only, same shape as the Sign/guides doc's Phase 0-4 table, assuming the same locale order
(Hebrew first) for consistency - not re-arguing that order:

| Phase | Work package | Acceptance / rollback |
|---|---|---|
| 0: infrastructure + source correction | Fix the H1/homeContent drift (row 3); add `documentationHomePath`; add the `localizedHome` collection + `[locale]/index.astro` route; add `FileDropzoneMessages`/`RecentFilesMessages`; wire `Footer`/`AppBar` to pass `labels`/`variants`/`locale` from the new route; extend `sitemap.xml.js` with `homeAlternates()`. No Hebrew copy ships yet - this phase is "English `/he/` builds and 404s correctly for drafts, everything renders from the same English strings via the new plumbing." | Build succeeds; `/he/` 404s cleanly (no `localizedHome` entry yet) or previews as noindex draft; `npm run test:redirects`/`test:seo`/`test:css` all still pass on the unchanged English `/`; no visual/behavior change to the English page. |
| 1: RTL demo-direction decision (blocking, ยง4.2) | Product decision: mirror HeroDemo, keep it physically LTR, or ship it English-only initially. This phase produces a decision record, not code. | Documented decision, with the tradeoffs from ยง4.2 explicitly weighed - this is the one gate in this table that is not an engineering deliverable. |
| 2: Hebrew content, everything except HeroDemo | Populate `localized-home/he.yaml` (ยง5.2 field list); translate `FileDropzone`/`RecentFiles`/`ConfirmDialog` overrides; wire trust chips through the shell catalogue (ยง5.3); native review pass. HeroDemo ships in whatever state Phase 1 decided (translated-and-mirrored, translated-LTR, or English-only with an isolation notice per the Sign/guides doc's precedent). | Every ยง2 row except HeroroDemo's internal form-field content (if deferred) has reviewed Hebrew text; `dir="rtl"` renders correctly at 320px/200% zoom per the Sign/guides doc's own accessibility checklist; `FileDropzone`'s Hebrew strings verified against real tile dimensions in a real browser (ยง3) - not jsdom; CLS measured on `/he/` the same way CLAUDE.md's own historical incidents were measured (`PerformanceObserver({type:'layout-shift'})`), compared against the English baseline. |
| 3: HeroDemo (if deferred from phase 2) | Full translation of the ~150-line demo per whatever Phase 1 decided; fixed-width form-field content specifically re-measured per locale (ยง3). | Demo renders correctly at both breakpoints, no clipped/truncated simulated form text, `sr-only` narration paragraphs translated and still accurately describing the (possibly now-mirrored) sequence of events, no-JS `<noscript>` finished-state stylesheet (`public/hero-demo-noscript.css`, referenced at `HeroDemo.astro:33`) still renders correctly with translated copy. |
| 4: SEO verification + indexing | `homeAlternates()` live in the sitemap; `verify-seo.js` green; Google Rich Results Test on the new page's JSON-LD; indexing request submitted per the Sign/guides doc's own "a copy change is not done until the page is recrawled" rule (from `docs/seo-competitive-findings.md`'s standing rules, cross-referenced in CLAUDE.md's Search acquisition section). | Sitemap entry present and correct; reciprocal alternates verified live (not just in the build); indexed snippet matches live page content, not a stale crawl. |

## 9. Open questions / explicit non-goals

**Open questions requiring a product decision before implementation:**

1. **HeroDemo's direction of motion under RTL** (ยง4.2) - mirror, keep physically LTR, or defer/skip. This
   blocks Phase 2/3 of ยง8's rollout and is the single largest unresolved question in this document.
2. **Tool dock mirroring** (ยง4.1) - is an RTL-flipped dock order correct for an element deliberately
   designed to read as a fixed, memorized OS affordance, or does the "macOS dock" mental model imply it
   should stay in a consistent position regardless of document direction? Flexbox will mirror it
   automatically with zero code changes if no explicit override is added - so the "do nothing" path
   *produces* the mirrored behavior by default, which may or may not be the intended answer.
3. **Should `gridTitle`/`gridDescription` join `TOOL_SOURCE_FIELDS`?** (ยง2 row 10) This is the one item in
   this document that reaches back into the Sign/guides doc's own infrastructure (`src/i18n/
   localizedTools.ts`) rather than being purely home-page-local. Adding these two fields would also affect
   every localized tool page's own rendering wherever `gridTitle`/`gridDescription` are used there (not
   audited in this pass - grep before deciding), so this needs sign-off as a shared-infrastructure change,
   not a home-page-only one.
4. **Is the scroll-driven story worth translating at all for a first Hebrew release**, versus shipping
   `/he/` with everything else localized and HeroDemo deferred or kept English (ยง8 Phase 2/3 split
   anticipates this either way, so no implementation blocks on answering it before Phase 0-2, but Phase 3's
   scope depends on the answer).
5. **Where does the "Sign & Fill" name inside `FileDropzone`'s practice-document caption** (row 21) come
   from once tool names are localizable - should it read the actual localized tool's `toolName` field
   (parameterized, per ยง5.4) even before `/he/sign/`'s island itself is fully localized (recall from the
   Sign/guides doc review: `PdfSignTool` is **not** in `LOCALIZED_TOOL_ISLANDS` today, `[tool].astro:97`
   passes it only `shellMessages`, not `toolMessages` - so a Hebrew home page could plausibly say "פותח
   ב-חתימה ומילוי" while the tool it links to still shows English buttons, matching the same "documentation
   translated, editor stays English" split already established for `/sign/` itself)?

**Explicit non-goals of this document:**

- Authoring reviewed Hebrew (or any other locale's) marketing copy. ยง7.2's two-row table is illustrative
  only.
- Deciding locale rollout order or priority beyond following the Sign/guides doc's existing Hebrew-first
  precedent for consistency.
- Fixing the general "no localized Markdown twins exist yet" gap (ยง6's last bullet) - flagged, not solved,
  since it is broader than the home page.
- Auditing every physical-direction CSS declaration in `HeroDemo.module.css` (~1400 lines) exhaustively -
  ยง4.2 cites the declarations a targeted search surfaced, not a complete inventory; a real implementation
  of whichever ยง4.2 option is chosen needs its own full audit of that file.
- Resolving whether other `<FileDropzone>` call sites exist outside `index.astro` (ยง5.4 flags this as
  unverified) - a repo-wide grep was not performed as part of this reading.
