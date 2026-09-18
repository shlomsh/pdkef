---
id: "ARCH-23"
title: "Narrow the fonts project's tool-sign edge to the text pipeline, not all of src/tools/sign/"
status: "open"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-20", "QUAL-08"]
---

# ARCH-23 · A Sign toolbar or tooltip change should not run all 27 font guards

*Filed 2026-09-18*, from CI run 35380358167 (commit `15396adf`, "Tool tooltip leads with the button's
name").

## Problem

That commit changed only `src/editor-ui/ArmHint.tsx`, `src/editor-ui/SignToolbar.module.css` and
`src/tools/sign/components/SignToolbar.test.tsx` - a tooltip's markup, its CSS, and a unit test.
`scripts/affected-scope.mjs` narrowed `unit_paths`/`e2e_paths` correctly to `tool-sign` and
`tool-redact`, but printed `fonts=true`, so all 135 font-guard test instances ran (two shards, 8 +
127 tests, 2:29 and 2:38) and set the run's wall clock at 3:00 while every other job finished by
2:02.

Cause: `e2e/sign/project.json` (the `fonts` Nx project) declares
`"implicitDependencies": ["font-assets", "editor", "lib", "tool-sign"]`. `tool-sign`
(`src/tools/sign`) imports `editor-ui` (`ArmHint.tsx` is imported by `SignToolbar.tsx`), so *any*
change under `src/editor-ui/**` or `src/tools/sign/**` - toolbar chrome, tooltips, a test file - marks
`fonts` affected. This is a whole-project dependency edge; Nx has no file-level granularity on it.

Confirmed live: `NX_DAEMON=false npx nx show projects --affected --files=src/editor-ui/ArmHint.tsx`
answers `["editor-ui","tool-redact","cross-tool-tests","tooling","site-e2e","tool-sign","fonts"]`.

Checked whether the 6 of 27 guards that navigate to `/sign` themselves (the font-parity and
Hebrew-composition specs, per `.claude/rules/fonts-and-text.md`) actually exercise the toolbar: they
do not. `e2e/sign/hebrew-composition-guard.spec.js` and `e2e/sign/hebrew-font-parity.spec.js` call
`page.goto('/sign')` then drive `document.fonts`/canvas or import `src/editor/text/fonts.js` and
`bidiRuns.js` directly; none of the 6 use `page.click`/`fill`/`locator` against `SignToolbar` or
`ArmHint`, and no guard spec references either by name (`grep` across `e2e/sign/*.spec.js` for
`SignToolbar|ArmHint|editor-ui` returns nothing). They need `/sign` to render without crashing, not
any specific toolbar behavior.

This is the same wall QUAL-08 measured: font-guards set the wall on 32 of 40 green non-docs CI runs,
and "narrowing to Sign or Redact does not move the wall" because `tool-sign` is an implicit
dependency of `fonts` regardless (QUAL-08's addendum, 2026-09-18). Related: DEBT-06 (which took
`editor-ui` out of `CORE_PROJECTS` on the same "let the graph decide where it's provably right"
reasoning this ticket wants to extend to `fonts`' own edge) and DEBT-07 (whether `editor` also leaves
`CORE_PROJECTS`; open, same measurement).

**Measured (QUAL-08's second addendum, 2026-09-18):** checked every `narrow`-verdict CI run in the
62-push window since `9b4f944` (not just this one commit) against fonts-and-text.md's own `paths:`
list. **8 of 8 narrow-verdict runs with `fonts=true` in that window were not rightful - 0
counterexamples.** Each one's actual changed files are toolbar/tooltip/arming-UI components
(`SignToolbar`, `ArmHint`, `RedactToolbar`, `ElementToolbar`, `ElementResizers`, `DraggableWrapper`,
`FullscreenButton`) or their tests, never a fonts-and-text.md path. Median wall for these 8 was 169.5s
(range 146-188s) - inside noise of the 178s `everything` median, so the fix does not shrink CI
wall-clock (font-guards is the long pole in a parallel job graph either way, as QUAL-08 already
found). The reason to raise this ticket's priority is not wall-clock, it's a 100% measured coarse rate
with zero coverage benefit: two font-guards shards at roughly 2:29 and 2:38 each of these 8 times is
about 40 runner-minutes of CI compute spent in a single five-day window on guards that (per this
ticket's own Problem section) don't even exercise the code that changed. Full breakdown, method and
the `everything`-bucket cross-check: QUAL-08's "Addendum (2026-09-18): the fonts edge inflated the
measurement" section.

**Priority raised P2 -> P1 (2026-09-18):** the fix is narrowly scoped (this ticket's own Scope
section), already has precise acceptance criteria, and the measurement above found no case in the
window where the `tool-sign` edge correctly caught a real font/text change - the edge has produced
only false positives so far, at a real (if wall-clock-invisible) compute cost, unlike DEBT-07 (which
this same measurement found is only 50% coarse within its own bucket and is entangled with a larger,
undecided design question).

## Owner's decision (Shlomi, 2026-09-18) - overrides this ticket's original proposal

> The original intent of the font guard is to make sure the current fonts comply with the rules and
> guidelines required by our app. If there is no new font added or change in an existing one, the
> guard is not required to run. A nightly build runs it if there was any code change during the day,
> but not on each and every change in another independent Nx package.

The original Scope below (kept struck through in git history, not here) proposed carving a
`sign-text-pipeline` Nx project or a named-input filter so `fonts` could keep `tool-sign` as a
dependency while ignoring most of it. That still left every editor-ui/tool-sign UI file the *fonts-
and-text.md* rule already lists (`FontPickerMenu`, `SignatureDialog`, `FontSupportNotice`,
`ExportReadinessNotice`, `components/nodes/**`, `signExportReadiness*`, `languageAcceptance*`,
`editorFonts.css`) as a per-push trigger, on the theory that the guards navigate to `/sign` and so
"the whole Sign UI feeds them." The owner's rule is narrower and simpler: the guards exist to catch a
*font* regression, not a Sign UI regression, so the per-push gate should fire only when a file that
defines what a font *is* (an asset, the catalogue, its coverage claims, its license, or the guard
itself) changed - never for `editor`, `lib`, `tool-sign`, or `editor-ui` merely being on the dependency
graph, and never for a generic `everything` verdict caused by a core project touching something
unrelated to fonts.

**Measured, under the owner's rule (2026-09-18, `scripts/ci-narrowing-report.mjs` + a one-off
classifier, both in the 62-push window since `9b4f944` that QUAL-08's second addendum used;
re-run with `node strict.mjs ci-report.json` from the scratchpad path in that addendum to
reproduce):**

- The font-guards Playwright step actually ran on **44 of 62 runs**.
- Of those 44, **13** touched something under the *broad* reading of "fonts" (the whole
  `src/editor/text/` directory, `public/fonts/**`, `scripts/fonts/**`, `scripts/generate-font-*`,
  `scripts/check-font-*`, a guard spec/fixture under `e2e/sign/`, or `playwright.config.js`) - so
  **31 of 44 (70%)** were not needed even under a generous reading of "a font changed," not only the
  8-run tool-sign-edge bucket ARCH-23's Problem section already measured (that 8-run bucket is
  `fonts=true` on a *narrow* verdict; this 31/44 also counts the `everything`-verdict runs, because
  `wide()` forces `fonts: true` unconditionally whenever `everything` is true, so on those runs
  `fonts=true` was never a separate, gradable decision until now - see "Mechanism" below).
- Narrowing further to the actual list this ticket proposes (registry/catalogue files named below,
  not the whole `src/editor/text/` directory) leaves only **6 of those 13** genuinely rightful:
  `16c67378`, `19dca856` and `fdc3648a` touch `fonts.js`/`fontManifest.js`/`fontCoverageTable.js`/
  `fontCoverageReport.js`/`fontLicenses.js`/`displayOnlyFonts.js`/`languageAlphabets.js` or a guard
  spec/fixture directly; `3fad9714`, `657725de` and `14925730` touch `playwright.config.js` (which
  defines the `fonts-shard-1`/`fonts-shard-2` split itself). The other **7** are files that live in
  `src/editor/text/` but are shaping/runtime logic, not the catalogue: `combPlacement.ts` (4 runs:
  `a848570c`, `a6a38399`, `fcae9d81`, `097c8ed1`), `dateFormat.ts` (`79c2238c`), `liveFontCoverage.js`+
  `textCoverage.js` (`14f03fc7`), and `elementClassNames.ts` (`1ca6ecc7`) - none of them add or change
  a font; all seven are exactly the kind of code change the owner's rule says the nightly should catch
  instead. Under this ticket's actual proposed glob, **38 of 44 (86%)** of the historically-observed
  `fonts=true` runs would have been `fonts=false`, with no counterexample found in the window (every
  survivor genuinely touches a font asset, the catalogue, a guard, or the guards' own shard config).

**The nightly backstop is already done, not part of this ticket.** `ci.yml`'s `schedule: cron "17 3 * *
*"` already runs the guards, already skips itself via the `scope` job's `nightly_unchanged` output
when nothing has landed since its own last completed scheduled run, and `affected-scope.mjs` already
fails open to `fonts=true` on `schedule` (no base to diff against). That is exactly "a nightly build
runs it if there was any code change during the day" from the owner's rule, already shipped. This
ticket only changes the *per-push* gate.

## Scope (rewritten to the owner's rule)

**The per-push rule.** `fonts=true` on a push iff the diff touches:

- `public/fonts/**` (the font assets themselves);
- the font registry/catalogue/coverage files in `src/editor/text/` - named explicitly, not the whole
  directory, because that directory also holds shaping/runtime code (see below):
  `fonts.js` (the resolver and `SCRIPT_FALLBACKS`), `fontManifest.js`, `fontLicenses.js`,
  `fontCoverageTable.js`, `fontCoverageReport.js`, `fontCoverageLookup.js`, `displayOnlyFonts.js`,
  `languageAlphabets.js`, and each of those files' own `.test.js`/`.test.ts` companion plus
  `fontAttribution.test.js`, `fontCoverage.test.js` and `languageCoverage.test.js` (these are the unit
  tests that *are* the compliance proof - "does the current font set comply" - not incidental tests of
  unrelated code);
- `scripts/fonts/**`, `scripts/generate-font-*`, `scripts/check-font-*` (the generators and checkers
  that produce/validate the files above);
- the guard specs and fixtures themselves: `e2e/sign/*-guard.spec.js`, `e2e/sign/*-parity.spec.js`,
  `e2e/sign/language-acceptance.spec.js`, `e2e/sign/fixtures/**` (a guard change must run itself to
  prove it works, regardless of what else changed);
- `playwright.config.js` (defines the `fonts-shard-1`/`fonts-shard-2` split the guards run under);
- the `everything` triggers that are genuinely about the runner or the toolchain, which must keep
  forcing `fonts=true` even though nothing "font" was literally touched: `package.json`,
  `package-lock.json` (a dependency bump can change fontkit/pdf-lib's behaviour), `.github/workflows/ci.yml`,
  and `ORACLE_FILES` (`scripts/affected-scope.mjs`, `scripts/change-scope.mjs` - a change to the oracle
  itself is never trusted to narrow its own diff correctly).

**Explicitly NOT a trigger any more:** `editor`, `lib`, `tool-sign`, `editor-ui` as whole projects, and
therefore every file this ticket's original Scope proposed keeping as Sign-side triggers -
`signExportReadiness*`, `FontPickerMenu*`, `SignatureDialog*`, `FontSupportNotice*`,
`ExportReadinessNotice*`, `components/nodes/**`, `editorFonts.css`, `languageAcceptance*` (the Sign
component, not the script), `src/editor/registry/text*`, `src/editor/adapters/pdf/**` - none of these
add or change a font, they render or consume the catalogue. Also not a trigger: the shaping/runtime
files that share `src/editor/text/`'s directory with the catalogue but are not the catalogue -
`bidiRuns.js`, `comb.js`, `combPlacement.ts`, `dateFormat.ts`, `hebrewComposition.js`,
`liveFontCoverage.js`, `textCoverage.js`, `textFontSupport.js`, `textMetrics.ts`, `textTransforms.js`.
Nor a bare `everything` verdict whose only reason is a core project (`site`/`shell`/`editor`/`lib`)
touching something unrelated to fonts, or a generically "unowned" file that is not itself one of the
oracle/config/lockfile paths above.

**Mechanism: (a), a file-glob rule inside `scripts/affected-scope.mjs`. Recommended over (b) (carving
a new Nx project/named-input for the registry files).** Reasoning:

- The registry files above are interleaved with the shaping files inside one directory
  (`src/editor/text/`), the same problem this ticket's original Scope already flagged for the
  `tool-sign` edge: Nx's directory-root model gives a project ownership of a directory, not a named
  subset of files inside one shared with other, differently-owned code. Splitting them apart for real
  (moving the catalogue into its own directory) is a bigger refactor than this ticket's saving
  justifies, and Nx named-inputs (`inputs`/`namedInputs` filters) would still leave `scripts/affected-
  scope.mjs` asking a project graph for an answer the graph itself cannot cleanly represent - the same
  concern (b) raised in the original Scope, now confirmed rather than hypothetical, because the actual
  list (above) mixes files inside one directory more than `tool-sign` did.
- `wide()` (`scripts/affected-scope.mjs`, currently line 189) hard-codes `fonts: true` for *every*
  `everything` verdict, which is the real source of 25 of the 44 historically-affected runs (36
  `everything` runs total, minus the config/oracle/lockfile ones that should keep forcing it). Fixing
  that is a change to `wide()`'s call sites, not to the Nx graph: each `wide()` call already has the
  changed-file list in scope (it is how `unowned`, `oracleFiles` and `wideCore` are computed today), so
  the fix is to compute `const fontsMatch = files.some(matchesFontsGlob) || pkgOrOracleOrCiChanged;`
  once in `deriveScope()` and pass it into every `wide()` call and the `narrow()` return value alike,
  instead of `wide()` hard-coding `true` and `narrow()` reading `affectedSet.has('fonts')`. No Nx
  project change moves this needle; only the file-glob check does.
- A short, explicit list matching the owner's own sentence ("no new font added or change in an
  existing one") is easier to audit against that sentence than an Nx project boundary is - the
  reviewer can read the thirteen-ish path patterns and the owner's rule side by side.
- Precedent both ways exists: ARCH-20 retired a hand-kept `FONT_GUARD_INPUTS` list in favour of asking
  Nx, because that list was a coarse proxy for whole-project ownership that constantly drifted. This
  new list is not that - it is scoped to a specific, small, rarely-touched set of catalogue files
  (roughly a dozen, all inside one directory, none of them everyday edit targets), so the drift risk
  ARCH-20 was solving for is much smaller, and the Risk section below keeps the same "add to both
  places in the same change" discipline that already worked for `fonts-and-text.md`'s own list.

**Should the new glob be derived from `.claude/rules/fonts-and-text.md`'s `paths:` frontmatter, or
kept separate?** Kept separate, not edited by this ticket. The two lists answer different questions:
`fonts-and-text.md`'s frontmatter decides when an *agent* should have the whole font/text rule loaded
into context - deliberately broad, because an agent editing `bidiRuns.js` or `combPlacement.ts` should
see the shaping rules even though, per the owner's rule, that edit should not by itself re-run 27
Playwright specs on every push. `affected-scope.mjs`'s new list decides only "does this diff need the
expensive guards to run again before merge" - deliberately narrow, per the owner's rule. Conflating
them is arguably how this ticket's own Problem arose (the standing-rule paragraph in `fonts-and-
text.md` already narrates a CI mechanism, at the wrong grain). `fonts-and-text.md`'s "Standing rules"
paragraph (lines 45-61) will read as stale once this lands - it currently says `fonts`' inputs are
`font-assets`, `editor`, `lib`, `tool-sign` - and needs a factual correction to describe the new
mechanism in the same change (see Acceptance), but its own `paths:` frontmatter stays as-is; nothing
here asks to narrow it.

## Risk

Narrowing this trigger means a change to `editor`, `lib`, `tool-sign`, `editor-ui`, or the
shaping/runtime files named above (`bidiRuns.js`, `comb.js`, `combPlacement.ts`, `hebrewComposition.js`,
`liveFontCoverage.js`, `textCoverage.js`, `textFontSupport.js`, `textMetrics.ts`, `textTransforms.js`,
`dateFormat.ts`) will no longer trigger the font guards on push, even when it should have introduced a
real shaping/export regression - this is not an edge case the mechanism misses, it is what the owner's
rule asks for: that class of regression is the nightly's job now, and the nightly already runs on any
day with a code change and already skips itself on a quiet day (see "the nightly backstop is already
done" above). The residual risk this ticket does still own: any *new* file a guard starts reading that
is not on the list above must be added to `scripts/affected-scope.mjs`'s glob in the same change that
adds the guard - the same "add to both places" discipline `fonts-and-text.md` already states for its
own list, restated here for the CI-side list specifically since the two lists are deliberately kept
separate (see "kept separate" above). A change to a file on the registry/guard list above must still
mark `fonts` affected; a change to `SignToolbar.tsx`, `ArmHint.tsx`, `FontPickerMenu.tsx`,
`combPlacement.ts`, or any other file outside that list must not.

## Expected saving

Toolbar, tooltip, arming-UX and non-text unit-test changes to Sign or Redact (the DEBT-06 measurement
already showed `editor-ui`'s only consumers are Sign and Redact) stop paying the font-guards' 2:29 /
2:38 shard cost, and so does every `editor`/`lib` change that does not touch a font registry file or a
guard - `combPlacement.ts` and `dateFormat.ts` changes alone accounted for 5 of the 44 historically-
measured `fonts=true` runs in the window. QUAL-08's addendum found the *median-wall* effect of the
narrow tool-sign-edge case small (170s against 178-180s for `everything`, inside noise) because the
font-guards job is the long pole in a parallel job graph either way - `15396adf` is the case where it
mattered on its own (a tooltip-only push with no other reason to run the guards, paying the full 3:00
for zero coverage benefit), and this ticket's wider fix compounds that same zero-benefit cost across
every one of the 38-of-44 (86%) historically-measured runs that touched neither a font asset, the
catalogue, a guard, nor the guards' own shard config (see "measured, under the owner's rule" above).
The saving is in CI compute (roughly 40 runner-minutes per five-day window at the old rate, per QUAL-
08's addendum) and in the unit-test step dropping 3x locally and in `checks`, not in wall-clock median
- it does not change QUAL-08's median-wall conclusion or the DEBT-07 decision, both of which are about
a different, smaller bucket (the `core project(s) affected` `everything` runs DEBT-07 owns).

## Acceptance

- A change shaped like `15396adf` (only `src/editor-ui/ArmHint.tsx`,
  `src/editor-ui/SignToolbar.module.css`, `src/tools/sign/components/SignToolbar.test.tsx`) makes
  `node scripts/affected-scope.mjs` print `fonts=false`, while `unit_paths`/`e2e_paths` still narrow
  to `tool-sign`/`tool-redact` exactly as today.
- A change to only `src/lib/**` or `src/editor/**` outside the named font-registry files (e.g.
  `src/editor/text/combPlacement.ts`, `src/lib/drafts/draftStore.js`) prints `fonts=false`;
  `everything` may still be `true` for the unit/e2e scope if `editor`/`lib` are core projects for
  other reasons, but `fonts` is decided independently of that.
- A change to `public/fonts/**`, `src/editor/text/fonts.js`, a guard spec under `e2e/sign/`,
  `playwright.config.js`, or `package-lock.json` still prints `fonts=true`.
- A `schedule` or `workflow_dispatch` run still prints `fonts=true` unconditionally (unchanged
  fail-open behaviour - this ticket only changes the `push`/`pull_request` path).
- `scripts/affected-scope.test.mjs` gets a case for each of the four bullets above, following the
  existing synthetic-`ROOTS` pattern (no real `nx`/`git` call); the two existing tests that currently
  assert the *old* behaviour ("narrows an editor-ui-only change to Sign, Redact... fonts=true" and
  "always sets fonts=true alongside everything=true") are updated to the new expectation rather than
  left contradicting it.
- `ci.yml`'s `font-guards` job comment (currently describing `fonts`' inputs as "public/fonts,
  src/editor, src/lib, tool-sign") and `docs/nx-affected-ci.md`'s `fonts` row and its
  `implicitDependencies` paragraph are updated to state the owner's rule and the new glob, in the same
  change as the code.
