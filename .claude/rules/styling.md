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

Loaded when working on stylesheets, the theme, or the CSS guardrail scripts. The rules every agent gets
are in CLAUDE.md (declare a `@theme` token before a new utility; register a component in its page
family's entry sheet; colors only from tokens). This file is the mechanism, the boundary, and what the
CI ratchets measure.

## Theme / color palette

All color is CSS custom properties in `global.css`'s `:root`; never a hex/rgba literal in a component
or stylesheet. Current palette ("Sea Glass"): `--color-bg #f4f9fa`, `--color-surface #ffffff`,
`--color-surface-sunken #c4e1e6`; `--color-text #23404a`, `--color-muted #4a6570`,
`--color-muted-light #a4ccd9` (decorative only, never readable text); `--color-primary #3e7c8d`
(hover `#397281`, active `#356d7d`, soft `#eef6f8`, tint `#e6f1f3`) for buttons, focus rings and
borders, with `--color-primary-text #397281` as the readable foreground form for links and
`currentColor` controls (never the surface token as text); `--color-success #5c7a3a` (hover `#4a632f`,
soft `#ebffd8`), `--color-danger #b84c58` (soft `#fcf1f3`), both retuned for the teal base.

Changing the theme: edit `:root`, then `grep -rn "rgba(0\|#[0-9a-f]\{6\}"` across `src/` and `public/`
for escaped literals (button/dropzone shadows and the body glow have been hardcoded before), and update
`theme-color` in `BaseLayout.astro` and `theme_color`/`background_color` in
`public/manifest.webmanifest`, which are not CSS. A color-only change needs only a dev-server check.

## The styling boundary (scoped hybrid, landed 2026-07)

- **Tailwind** for the static `.astro` surface only (pages, heroes, cards, footer, dropzones, static
  buttons): no runtime state, no cascades.
- **CSS Modules**, colocated per component, for the editor (`SignTool/*`, `RedactTool`,
  `ElementToolbar`, resizers, element nodes). Keep semantic class names so descendant-state cascades
  (`.sign-element.active .sign-element-actions`) survive as real CSS inside module scope. Prefer them
  over `@apply`, which scatters editor styling back into a global file. `global.css` has zero editor
  selectors (`check-editor-global-css.js`).
- **Inline styles / custom properties** for per-element runtime geometry (`top/left/width/height/
  fontSize` percentages): continuous floats the JIT cannot emit classes for.
- The editor's stateful appearance is never inline conditional utility strings: state lives once as a
  class on the parent and CSS fans it out. Never delete a `.sign-*` cascade without checking every
  state (active, RTL, dark, mobile, whiteout) in a running editor.

## Tailwind mechanics

- `global.css`'s `@theme` deliberately skips Tailwind's default theme, so a utility whose scale step is
  not declared (`font-bold`, `rounded-2xl`) compiles to **no CSS**, silently. Declare the token first.
  `@theme` is `static` because the editor's CSS Modules read `--shadow-sm`, `--ease-out`,
  `--radius-md` and the `--font-weight-*` steps, which Tailwind cannot see; tree-shaking them would make
  their presence depend on an unrelated `.astro` file using the same utility (580 bytes a page).
- **Utilities are compiled per page family (ARCH-13).** Five entry sheets in `src/styles/` (`homePage`,
  `toolPage`, `contentPage`, `licensesPage`, `notFoundPage`) each import `global.css`, then
  `tailwindcss/utilities.css` with `source(none)`, then an explicit `@source` list of the markup that
  family renders (shared shell in `sharedSources.css`). Every page imports exactly one. `global.css` is
  tokens, element defaults and the `.type-*`/`.space-*` roles only, paid for on every page, so a rule
  belongs there only if every page needs it. **Adding a component to a family means adding it to that
  family's entry sheet**; `check-dead-utilities.js` checks each page against its own stylesheet and
  names the page and the class. `source(none)` also retires the old hazard of prose (`docs/`, root
  `.md`, plugin data files) being scanned for utility candidates.
- Emission order: the page stylesheet now comes **before** the CSS Modules. The only observable delta
  is that `:focus-visible { border-radius: 4px }` in `global.css` no longer beats module radii, so a
  focused editor card keeps its 16px shape; no element loses a focus ring. Kept on purpose: the old
  precedence was an accident of order.

## `build.inlineStylesheets: 'always'` is a measured decision

Every page inlines its whole stylesheet (1,060,961 raw bytes across 20 pages for 107,384 distinct),
which is the main input to the duplication factor. `'auto'` was benchmarked head to head (2026-08-20)
and lost every scenario: an external `<link rel="stylesheet">` is render-blocking, discovered only
after parse, with no preload from Astro, so it adds a round trip before first paint and costs more
first-view bytes (`/sign/`: 43,097 vs 41,723 brotli). Modelled: +150ms slow 4G, +60ms fast 4G, +25ms
broadband. Multi-page does not rescue it (`'auto'` emits six sheets, only `global.css` is shared), and
even an idealized hybrid needs 5 to 15 page views per session to repay one round trip against cold
single-page search visits. `check-css-duplication.js` and `check-page-weight.js` read inline `<style>`
only, so they go blind if this flips. Full numbers in the comment on `inlineStylesheets` in
`astro.config.mjs`.

## CI guardrails for CSS

- **Class resolution** (`check-class-resolution.js`, runs first in `test:css`): reads `src/**/*.jsx`
  and fails on a class string with no rule anywhere, a raw string whose rule is CSS-Modules-hashed, or a
  `styles['key']` lookup missing from its module (renders `class="undefined"`). Exists because the
  built-HTML guard only sees an island's initial markup: `UndoHistoryModal` shipped unstyled against a
  module nothing imported, and `.hint-message` was deleted from `global.css` and never re-homed. **Before
  allowlisting a class in either script, check for a rule in some `.module.css`; if one exists, the bug
  is a missing import.**
- **Dead utilities** (`check-dead-utilities.js`): per page, against that page's own inline stylesheet.
- **Editor CSS ratchet** (`check-editor-global-css.js`): zero `sign-`/`sig-`/`redact-`/`editor-`/`el-`
  selectors in `global.css`.
- **CSS duplication** (`check-css-duplication.js`): hard ratchets that only go down. Limits as of
  2026-09-12 (37 pages): **9.45x** duplication (measured 9.25x), **10,000** worst-page dead bytes
  (9,765 on `/split/`), **148** single-page utilities (32). The duplication factor is page-count-
  sensitive by construction; re-base it when pages are added and say so. **The fix is to narrow what a
  page carries, never to raise a limit.**
  **Read the numbers off the script, not off this line.** It said 7.00x/5.79x/7,567/144 until
  2026-09-12, having missed three re-bases (7.75x, 9.00x, 9.45x) as LOC-02/03/05/09 published the
  Hebrew edition - a stale figure in guidance is worse than no figure, because it reads as a budget
  someone has already blown. `node scripts/check-css-duplication.js` prints every limit beside its
  measured value, and the constants in that file carry the dated re-base history. Date any correction
  here, or leave the numbers out.
- **Page weight** (`check-page-weight.js`): two budgets per page, not ratchets: document plus
  eagerly-referenced JS (brotli), and eagerly-referenced images (raw). Runtime `import()` chunks are
  uncounted, so one going eager shows as a jump. Images count the largest `srcset` candidate, skip
  `loading="lazy"`, favicons and manifest icons; CSS `url()` images are invisible. Exists because the
  brand logo shipped for months as a 512x512, 153,946-byte PNG painted at 24px on 18 of 21 pages.
