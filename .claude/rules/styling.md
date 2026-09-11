---
paths:
  - "src/styles/**"
  - "src/**/*.css"
  - "src/layouts/**"
  - "astro.config.mjs"
  - "public/manifest.webmanifest"
  - "scripts/check-class-resolution.js"
  - "scripts/check-dead-utilities.js"
  - "scripts/check-css-duplication.js"
  - "scripts/check-editor-global-css.js"
  - "scripts/check-page-weight.js"
  - "docs/E2.*"
---

# Styling: tokens, Tailwind per page family, CSS Modules for the editor

Loaded when working on stylesheets, the theme, or the CSS guardrail scripts. The short rules in
CLAUDE.md (declare a `@theme` token before using a new utility; add a component to its page family's
entry sheet; never hardcode a color) are the ones every agent gets. This file is why they exist and
what the CI ratchets measure.

## Theme / color palette

All color is driven by CSS custom properties defined once in `src/styles/global.css`'s `:root` block — never hardcode a hex/rgba color in a component or another stylesheet; reference the variable (e.g. `var(--color-primary)`) so the palette stays swappable from one place.

Current palette ("Sea Glass" — teal and cool grays, replacing the earlier navy + electric blue theme):
- `--color-bg: #f4f9fa`, `--color-surface: #ffffff`, `--color-surface-sunken: #c4e1e6` — cool white/glass surfaces.
- `--color-text: #23404a`, `--color-muted: #4a6570`, `--color-muted-light: #a4ccd9` — deep teal ink, readable muted slate, then decorative-only pale slate. `--color-muted-light` must not carry readable text.
- `--color-primary: #3e7c8d` (hover `#397281`, active `#356d7d`, soft tint `#eef6f8`, tint `#e6f1f3`) — the surface accent used for primary buttons, focus rings and borders. `--color-primary-text: #397281` is the readable foreground form used for links, accent-coloured text and controls whose icon and label share `currentColor`; do not use the surface token as text.
- `--color-success: #5c7a3a` (hover `#4a632f`, soft `#ebffd8`), `--color-danger: #b84c58` (soft `#fcf1f3`) — both were retuned alongside the retheme to read well against the cool teal base; don't recolor these without a reason.

When changing the theme in the future: update the `:root` block in `global.css`, then `grep -rn "rgba(0\|#[0-9a-f]\{6\}"` across `src/` and `public/` for any color literal that escaped the variable system (several button/dropzone shadows and the body background glow were historically hardcoded as `rgba(...)` rather than referencing a variable — re-check these). Also update `theme-color` in `BaseLayout.astro` and `theme_color`/`background_color` in `public/manifest.webmanifest` to match, since those aren't CSS and don't pick up the `:root` vars automatically. A pure color-only change doesn't touch scripts or CSP, so a `npm run dev` visual check is enough — full `build && preview` isn't required unless the change also touches scripts/`astro.config.mjs`.


## Styling direction (scoped hybrid, not a wholesale Tailwind migration)

The decided direction is a **scoped hybrid**, documented in full in Part II §3.1 below:

- **Tailwind** for the static/SEO `.astro` surface only (pages, heroes, cards, footer, dropzones, static buttons) - no runtime state, no cascades. `global.css`'s `@theme` block deliberately skips Tailwind's default theme (CSS budget), so a utility whose scale step isn't declared there (e.g. `font-bold`, `rounded-2xl`) silently compiles to **no CSS at all** - not an error, just a missing rule. Declare the token before using a new utility class. `npm run test:css` runs `scripts/check-dead-utilities.js`, which fails the build if any class in the built HTML has no matching selector.

  **That guard only sees an island's initial server-rendered markup**, because it reads the built HTML. Any class that appears only after an interaction - a loaded file, an open dialog, an error - is invisible to it, and two real defects lived in that gap for months (`UndoHistoryModal.jsx` rendering raw strings against a CSS Module nothing imported, so the Undo dialog shipped unstyled; `.hint-message` deleted from `global.css` and never re-homed, so five tools' "not a PDF" notice rendered as bare text). `scripts/check-class-resolution.js` is the source-side complement and runs first in `test:css`: it reads `src/**/*.jsx` and fails on a class string with no rule anywhere, a raw string whose rule is CSS-Modules-hashed, or a `styles['key']` lookup missing from the module it points at (which renders `class="undefined"`). **If you are about to allowlist a class in either script, check whether it has a rule in some `.module.css` first - if it does, the bug is a missing import, not a hook.**
  **The utility layer is compiled per page family, not once for the repo (ARCH-13).** There are five
  entry stylesheets in `src/styles/` - `homePage.css`, `toolPage.css`, `contentPage.css`,
  `licensesPage.css`, `notFoundPage.css` - and each one imports `global.css`, then
  `tailwindcss/utilities.css` with **`source(none)`**, then an explicit `@source` list naming the markup
  that family can render (the shell's share is factored into `sharedSources.css`). Every page imports
  exactly one of them, so nothing is inlined twice into a page, and a page no longer carries the other
  families' utilities: `/licenses/` went from 27,308 dead bytes to 1,100, and site-wide duplication from
  8.39x to 5.79x. `global.css` is now tokens, element defaults and the `.type-*`/`.space-*` roles only -
  still the one tier paid for 22 times, so a rule belongs there only if every page needs it. **Adding a
  component to a family means adding it to that family's entry sheet.** Forgetting is a build failure,
  not a silent visual bug: `check-dead-utilities.js` checks each page against *its own* stylesheet and
  names the page and the class. Full ownership note in `src/styles/toolPage.css`.

  This retires the old "documentation is not a template" hazard **structurally**, and the `@source not`
  list with it. Tailwind v4's default scan used to walk the whole project and read prose for utility
  candidates - root `.md` files, `docs/`, and the impeccable plugin's rule tables under `.github/` were
  all compiling real utilities into the one stylesheet every page inlined, invisibly (no error, no
  failing class, just a heavier stylesheet on every page; the old `scrum-board.data.js` was worth 83
  bytes per page by itself). With `source(none)` nothing is scanned unless a family asked for it, so a
  new note, report or plugin data file cannot reintroduce it. The trade is the opposite failure mode -
  under-sourcing rather than over-sourcing - which is why the per-page guard above had to land in the
  same change.

  **One side effect to know about:** the page's own stylesheet is now emitted **before** the
  components' CSS Modules, where it used to come after. Only `global.css`'s *unlayered* rules are
  order-sensitive at all (a layered rule loses to an unlayered module rule at any order), and of those
  only `:focus-visible` can tie with a module rule - `.sr-only`, `.merge-tool` and `.disclosures` are
  never written on an element that also carries a module class, and the rest are element selectors,
  `*` or `#app`. So the entire delta is that `:focus-visible { border-radius: 4px }` no longer beats
  the 59 module rules that set their own radius: a keyboard-focused editor card used to snap from
  16px to 4px while focused and now keeps its shape. No element loses a focus ring (checked
  mechanically: no module suppresses `outline` at single-class specificity without defining its own
  `:focus-visible`). This was kept rather than re-encoded, because the old precedence was an accident
  of emission order and the same hazard Part II §5 already records twice.

  **`@theme` is `static`** for a related reason: Tailwind otherwise emits only the tokens its generated
  utilities reference, which was survivable when one utility set covered the site and is not now that
  each family compiles its own. `--shadow-sm`, `--ease-out`, `--radius-md` and the `--font-weight-*`
  steps are read by the editor's CSS Modules, which Tailwind cannot see, so their emission would
  otherwise depend on some unrelated `.astro` file happening to use `shadow-sm` on that same page. Costs
  580 bytes a page, the same as the tree-shaken set happened to be.
- **CSS Modules** (scoped, colocated per component) for the canvas editor (`SignTool/*`, `RedactTool`, `ElementToolbar`, resizers, element nodes). Keep semantic class names so the descendant-combinator state cascades (e.g. `.sign-element.active .sign-element-actions`) survive as real CSS inside module scope.
- **Inline styles / CSS custom properties** for per-element runtime geometry (`top/left/width/height/fontSize` percentages) - these are continuous floats the Tailwind JIT cannot emit classes for.

This is explicitly **not** "finish the wholesale Tailwind migration." The goal is to kill the single global CSS monolith by scoping styles, not to Tailwind-ify the editor.

## The styling boundary (design standard §3.1)

- **Tailwind** for `.astro` pages, cards, heroes, footer, dropzones, static buttons: no runtime state,
  no cascades. This is where utility-first genuinely shines.
- **CSS Modules** (preferred over `@apply`) for `SignTool/*`, `RedactTool`, `ElementToolbar`, resizers,
  and element nodes. Keep semantic class names (`.sign-element`, `.active`, `.sign-element-actions`) so
  **descendant-combinator state cascades survive as real CSS inside module scope**. CSS Modules give
  true scoping and colocation; `@apply` scatters editor styling back into a global file and drifts from
  the JSX.
- **Inline styles / CSS custom properties** for per-element geometry (`top/left/width/height/fontSize`
  percentages). These are continuous runtime floats and **cannot** be Tailwind utilities (the JIT only
  emits classes it sees at build time; there is no `top-[43.7%]` for an arbitrary value).

**The one styling rule to remember:** the editor's stateful/cascade appearance is **never** expressed as
inline conditional utility strings. State lives once (a class on the parent); CSS fans it out.


## `build.inlineStylesheets: 'always'` is a measured decision

- **`build.inlineStylesheets: 'always'` is a measured decision, not a leftover default.** Every page
  inlines its whole stylesheet, which ships 1,060,961 raw bytes of CSS across 20 pages for 107,384
  bytes of distinct rules and is the main input to the duplication factor (9.73x when this was written;
  5.79x since ARCH-13 split the utility layer per page family). That looks like an
  obvious win to reclaim, and it is not. `'auto'` was built and benchmarked head to head (2026-08-20)
  and lost every scenario: an external `<link rel="stylesheet">` is render-blocking and is discovered
  only after the document parses, and Astro emits no preload for it, so it serializes an extra round
  trip in front of first paint while also costing *more* first-view bytes (/sign/: 43,097 vs 41,723
  brotli). Modelled render-blocking time put `'auto'` behind at every network profile (+150ms slow 4G,
  +60ms fast 4G, +25ms broadband), with and without TCP slow start. The multi-page case does not
  rescue it, because `'auto'` emits six stylesheets rather than one and only `global.css` is used by
  all 20 pages, so a second page view usually discovers a fresh sheet and pays the RTT again. Even an
  idealized hybrid (only `global.css` external) needs 5 to 15 page views in a single session to repay
  its one round trip, against a traffic model of cold single-page visits from search. Two guardrails
  also assume this setting and silently go blind without it (§6.5). Full numbers live in the comment
  on `inlineStylesheets` in `astro.config.mjs`; the duplication factor being "inflated by the config"
  is a known property, not a bug to fix by flipping it.

## CI guardrails for CSS

3. **Class resolution** (`check-class-resolution.js`, `check-dead-utilities.js`) - no class string
   without a matching rule, and no Tailwind utility compiling to nothing. `check-dead-utilities.js`
   asks that question **per page**, against that page's own inline stylesheet, not against the whole
   build concatenated. That distinction was cosmetic while one utility sheet went to every page and is
   load-bearing since ARCH-13: it is what turns a missing `@source` in a page family's entry sheet into
   a named build failure instead of a page that quietly renders unstyled.
4. **Editor CSS ratchet** (`check-editor-global-css.js`) - zero `sign-`/`sig-`/`redact-`/`editor-`/`el-`
   selectors in `global.css`.
5. **CSS duplication** (`check-css-duplication.js`) - hard ratchets on duplication factor, dead bytes
   and single-page utilities. Every number here measures a mistake, so these only ever go down. The
   one exception is the duplication factor, which is page-count-sensitive by construction (see the
   hazard on `inlineStylesheets` in §5): re-base it when pages are added, and say so. Both this
   script and `check-page-weight.js` read inline `<style>` only, so they measure the real stylesheet
   only while `build.inlineStylesheets` stays `'always'`. Current limits, after ARCH-13 changed the
   delivery model rather than the numbers: **7.00x** duplication (measured 5.79x), **10,000** worst-page
   dead bytes (measured 7,567 on `/split/`), **148** single-page utilities (measured 144). The first two
   were 9.60x and 27,750 with ~1% of margin left, which is the state ARCH-13 existed to fix - **the fix
   is to narrow what a page carries, never to raise a limit.**

6. **Page weight** (`check-page-weight.js`) - two separate budgets per page: document plus
   eagerly-referenced JS (brotli), and eagerly-referenced images (raw, since they are already
   compressed and served as-is). Deliberately *not* ratchets: features grow page weight and that is
   not a defect. Runtime-`import()` chunks are uncounted on purpose, so one becoming eager shows up
   as a jump. The image budget counts the **largest** `srcset` candidate (a retina device downloads
   the 2x, and a budget should measure the worst realistic case), skips `loading="lazy"`, and skips
   favicons and manifest icons (fetched once per origin, not per page). It exists because the brand
   logo shipped for months as a 512x512, 153,946-byte PNG painted at 24px in the app bar on 18 of 21
   pages, and a guard whose whole job is first-load weight said nothing because it only looked at
   `.js`. Images referenced from CSS `url()` are still invisible here.
