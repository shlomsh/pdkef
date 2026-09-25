# ARCH-20: Nx as the affected-scope oracle, on the real `src/tools/` layout

Filed from the `arch-20` worktree, forked from `main` at `27c637f` - after ARCH-15 through ARCH-19:
every tool is a real folder under `src/tools/<tool>/`, `src/shell/`/`src/editor-ui/`/`src/editor/`/
`src/lib/` are real folders, and `src/components/` holds only `.astro` files, `HeroDemo/` and
`compareFigure.css`. This is the design record ARCH-20 lands with; see `backlog/tasks/ARCH-20.md` for
the ticket and `docs/module-boundaries.md` for the layout this configuration mirrors.

An earlier prep branch, `arch-20-prep` (forked at `ef18a21`, after ARCH-16/19 but before ARCH-17/18),
built the same idea against a layout where the tools were still flat in `src/components/` and found
several real gotchas (the root-project trap, the `.astro` blind spot, two Vitest CLI gotchas). Those
findings are folded in below, credited where they still apply; `arch-20-prep` itself was never merged
and is not part of this history - its `project.json` files name folders that no longer exist.

## What landed

Twenty `project.json` files, no workspace conversion, no per-project `package.json`, `nx.json` at
the repo root, `.nx/` gitignored:

| Project | Root | `test` | `e2e` |
| --- | --- | --- | --- |
| `shell` | `src/shell` | ✓ | - |
| `editor` | `src/editor` | ✓ | - |
| `editor-ui` | `src/editor-ui` | ✓ | - |
| `lib` | `src/lib` | ✓ | - |
| `site` | `src` (not the repo root - see below) | ✓ | - |
| `i18n` | `src/i18n` | ✓ | - |
| `tool-merge` | `src/tools/merge` | ✓ | ✓ |
| `tool-sign` | `src/tools/sign` | ✓ | ✓ |
| `tool-redact` | `src/tools/redact` | ✓ | ✓ |
| `tool-compress` | `src/tools/compress` | ✓ | ✓ |
| `tool-security` | `src/tools/security` | ✓ | ✓ |
| `tool-split` | `src/tools/split` | ✓ | - (no `e2e/` folder yet) |
| `tool-edit-pages` | `src/tools/edit-pages` | ✓ | - |
| `tool-to-image` | `src/tools/to-image` | ✓ | - |
| `tool-image-to-pdf` | `src/tools/image-to-pdf` | ✓ | - |
| `font-assets` | `public/fonts` | ✓ (`test:fonts`) | - |
| `fonts` | `e2e/sign` (nested inside `site-e2e`'s own root) | - | ✓ |
| `export-guards` | `e2e/export` (nested inside `site-e2e`'s own root, sibling of `fonts`) | - | ✓ |
| `site-e2e` | `e2e` | - | ✓ |
| `cross-tool-tests` | `src/test/cross-tool` (nested inside `site-test`'s root) | ✓ | - |
| `form-corpus` | `src/tools/sign/fields/corpus` (nested inside `tool-sign`'s root, same shape as `cross-tool-tests` inside `site-test` - ARCH-24 moved it out of `editor`'s root) | ✓ | - |
| `site-test` | `src/test` (`cross-tool-tests` and `seo-content-guards` both nest inside it, same shape as `fonts` inside `site-e2e`) | ✓ | - |
| `seo-content-guards` | `src/test/seo` (nested inside `site-test`'s root, sibling of `cross-tool-tests`) | ✓ | - |

`fonts`' `implicitDependencies` **as this record originally landed**: `font-assets`, `editor`, `lib`,
`tool-sign` - the export pipeline the 27 font screening guards actually exercised at the time. **ARCH-23
(2026-09-18) superseded this**, after that `tool-sign` edge was measured causing a Sign toolbar/tooltip
change to run all 27 guards for zero coverage benefit (see "ARCH-23" below): `fonts`' own
`implicitDependencies` is now just `font-assets`, and the 25 shaping/parity guards remaining in it are
gated per-push by a file-glob in `scripts/affected-scope.mjs` (`matchesFontsGlob`), not by whether Nx
says `fonts` is affected. The two guards that actually drove the real export pipeline (the export
render guard, language acceptance) moved out to their own `export-guards` project
(`e2e/export/project.json`), which *does* keep `editor`, `lib` and `tool-sign` as coarse
`implicitDependencies` - see "ARCH-23" below for why that split is the right shape.
`site-e2e`'s `implicitDependencies`: `site`, `shell`, and every `tool-*` project - Playwright specs have
no import edges Nx can infer on their own.

**`site-test` (DEBT-04, second pass):** before this project existed, `src/test/` had no Nx project of
its own, so `@nx/js`'s inference fell back to attributing it to `site` (root project, `sourceRoot:
"src"`) - the same "unowned file" fallback `ownerOf()` uses, just at the Nx-graph layer instead of
`affected-scope.mjs`'s own. Five files import from it in a way that mattered: `src/lib/signHelpers.test.js`
and `src/editor/text/{bidiRuns,fonts}.test.js` import `src/test/fixtures/wysiwygStrings.js`;
`src/shell/{FileDropzone,BasePdfTool}.test.tsx` import `src/test/setInputFiles.js`. That gave `lib` and
`editor` a real edge to `site` (on top of `shell`'s), which is exactly what DEBT-07 needs gone before
`editor` can leave `CORE_PROJECTS`: `site` is itself core, so any project it can reach becomes
unnarrowable. `site-test` (`src/test/project.json`, `cross-tool-tests` nested inside it the same way
`fonts` nests inside `site-e2e`) gives those five files - and the repo-wide guard tests already in
`src/test/` (`moduleBoundariesImportScan`, `moduleBoundariesRules`, `noCamelCaseSvgAttrs`,
`editorDependencyDirectionsExceptions`; a fifth, `signLanguagePage`, moved out again under DEBT-07 -
see below) - a home Nx can name, so the edge each of those test files makes now lands on `site-test`,
not `site`. Several `src/tools/<t>/*.test.*`
files reach into `src/test/fixtures/`/`setInputFiles.js` too (`grep -rl "from '.*test/fixtures\|from
'.*test/setInputFiles" src` finds them); those tool -> `site-test` edges are fine and expected - a
tool depending on test-support infrastructure is not the coupling DEBT-07 cares about, since each
tool's own commits already run that tool's own tests regardless of what they import.
`scripts/affected-scope.mjs`'s `deriveScope()` needed one fix for this: its `extraPaths` filter only
excluded a project root that *starts with* `src/test/` (so `cross-tool-tests`, rooted at
`src/test/cross-tool`, was already skipped, since `src/test/` is unconditionally appended to
`unit_paths` afterward) - `site-test`'s own root is the literal string `src/test` (no trailing
slash), which that `startsWith` check does not match, so without the fix a `site-test`-only change
would have pushed `src/test/` into `unit_paths` twice. The filter now excludes `src/test` exactly, as
well as anything nested under it.

**`seo-content-guards` (DEBT-07):** `signLanguagePage.test.js` (the fifth of `site-test`'s original
five repo-wide guard tests) is not misplaced the way the other four are test-support - it is a
legitimately cross-cutting test, checking `src/content/content-pages/sign-pdf-in-your-language.yaml`
(the SEO content page) against `src/editor/text/fontCoverageReport.js`'s real `LANGUAGE_COVERAGE` data
- the same category of concern `cross-tool-tests` exists for. Sitting inside `site-test` gave this one
file's edge to `editor` the same reach `cross-tool-tests`' own tests have, except `site-test` is
depended on far more broadly (`lib`, `shell`, every tool, `fonts`), so this single file alone
reproduced the width the old `site -> editor` edge used to have. The fix is the same shape as
`cross-tool-tests`: a nested project, `src/test/seo/project.json` (`seo-content-guards`, name chosen
for what it actually checks - site content pages against editor data - not `signLanguagePage-tests`,
since a future guard of the same shape belongs here too), sibling to `cross-tool-tests` inside
`site-test`'s root. Measured: moving the file out of `site-test` and into this sibling project drops
both `lib` and `site-test` out of `editorModel.ts`'s affected set (`lib`'s only path to `editor` was
`lib -> site-test -> editor`, entirely through this one file) - see "Investigated (2026-09-17)" below
for the full before/after.

**Where this still falls short of `editor` leaving `CORE_PROJECTS`:** splitting `src/i18n/` into its
own project (above) does not, by itself, remove `site` (or any tool) from `editorModel.ts`'s affected
set, unlike `site-test`'s split. The reason is structural, not a missed step: `site` has a real,
unavoidable edge to `i18n` (astro pages and layouts import the message catalogues to render at all),
and every tool has its own real, permitted edge straight to `i18n` (module-boundaries rule 1: "a tool
may import site's i18n/data"). `src/i18n/toolMessages.ts` still does
`import type { SignMessages } from '../editor/registry/messages'`, so `i18n -> editor` is a real edge
too - and unlike `site-test`'s five files, this one cannot be moved to a neutral test-support project,
because it is production code that both the editor's registry and every tool's message catalogue
consumer need. So the chain `tool -> i18n -> editor` (and `site -> i18n -> editor`) reproduces the same
"everything" result the old `site`-fallback attribution used to produce, just through a real graph
edge into a narrow, non-core project instead of through `CORE_PROJECTS`'s override on `site`. Severing
it needs the design decision DEBT-04 already flagged and explicitly left open - moving or duplicating
`SignMessages` so `i18n` no longer imports anything from `editor` - not a mechanical reattribution.
See DEBT-07's "Investigated (2026-09-17)" note for the measured numbers.

`scripts/affected-scope.mjs` is the oracle, never the executor: it asks
`nx show projects --affected --files=<changed files>` once, then CI runs
ONE `playwright test <paths>` per shard, filtered by what it prints. `nx run <project>:test` targets
still exist on every `project.json` for local `npx nx run <project>:test`/`npx nx run-many -t test`
use, but nothing in `ci.yml` or `package.json` calls them.

**ARCH-28 (2026-09-25) superseded the `vitest run <paths>` half of this** - see that section, near the
end of this record, for the full change. `deriveScope()`'s own `unit_paths` field (and every rule below
that talks about it) is unchanged code and still backs `e2e_paths`, but nothing runs unit tests off it
any more.

## Executor vs. oracle: measured, not assumed

Design decision (point 1 of the working brief) was that `nx run-many`/`nx affected -t test` would cost
more than they save whenever most projects are affected, because each project pays Vitest's fixed
startup cost separately. Measured on this checkout, cold (`rm -rf .nx`, `NX_DAEMON=false`):

```
npm test                          12.5-13.4s wall, 147 files, 2802 tests, one Vitest process
npx nx run-many -t test           18.7-19.8s wall, 15 projects (font-assets/fonts/site-e2e have
                                   no `test` target or are e2e-only), 0% cache hit on a cold run
```

`run-many` is 40-50% slower end to end even though the 15 tasks run in parallel (nx reported a 9.7s
critical path against an 18.7s total, so parallelism does help, just not enough to beat one process
that pays Vitest's jsdom/transform setup cost once). This confirms the premise directly rather than
assuming it: CI runs `npx vitest run ${unit_paths}` (one process, narrowed by directory) and
`npx playwright test ${e2e_paths}` (one process per chromium shard, and one for the webkit job, QUAL-09),
never `nx affected -t test`/`-t e2e`.

## The root-project trap, confirmed again

`arch-20-prep` found that a project rooted at the repo root itself (`sourceRoot: "."`) gets outgoing
edges from `@nx/js`'s import inference but zero incoming ones - `site` must live at `src/project.json`
(`sourceRoot: "src"`), not at the repo root, or nothing can ever depend on it in Nx's own graph. This
branch keeps `@nx/js` for its import inference (see below), so the placement matters here too: `site`'s
`project.json` lives at `src/project.json`, not the repo root.

The trap only ever applied to a project rooted at the repo root itself, never to an ordinary subfolder
missing a `project.json` - and `scripts/` was the second kind, not the first. When this was first
written, `scripts/` had no `project.json` at all, so every file under it fell through to
`scripts/affected-scope.mjs`'s rule 2, "no owner -> everything." That was real: 25% of a measured
CI window ran everything for touching a `scripts/` file that did nothing runtime could reach, purely
because nothing claimed the directory. ARCH-22 closed it: `scripts/project.json` (`tooling`) gives the
directory a normal subfolder project like any other, so a flat `scripts/` file now narrows the same way
an `editor-ui`-only change does, through rule 5's `unit_paths`. The three subfolders that already had
their own `project.json` (`scripts/spike/mobi-10/`, `scripts/fixtures/editor-dependency-directions/`,
`scripts/fonts/`) still win by longest-prefix match, unchanged.

One deliberate exception remains, by design rather than by gap: `scripts/affected-scope.mjs` and
`scripts/change-scope.mjs` themselves are the CI oracle, so rule 3 forces `everything=true` on any
change to either file regardless of `tooling` owning them - the same reasoning `CORE_PROJECTS` gives
for `editor`, never trust a narrowed run to validate the code that decided to narrow it. Their own
tests (`affected-scope.test.mjs`, `change-scope.test.mjs`) are not part of that list and narrow like
any other tooling file.

## `@nx/js` stays, for import inference; the cross-tool tests move to `src/test/cross-tool/`

The working brief asked whether `@nx/js` is needed for import inference in this Nx version. It is:
core Nx ships the analyzer (`node_modules/nx/src/plugins/js`), but it only runs when `@nx/js` is
installed, and it runs whether or not `nx.json` lists a plugin (`plugins` is empty here; there is
nothing to configure). Without it, `nx graph` shows only the 15 `implicitDependencies` edges the
`project.json` files declare, and "affected" is directory ownership plus a hand-kept list, which is not
what this ticket is for. With it, the graph carries every real relative import: tool -> `shell`,
`editor`, `editor-ui`, `lib`, `site` (i18n and data); `lib` -> `site`; `editor` -> `lib`, and so on.

The first attempt on this branch had inference on and found that a single Sign file change widened to
all 17 projects. The cause was real, and it was a test-placement problem, not an inference problem:
three test files inside `src/editor/` (`workspace/draftCheckingPlaceholder.test.tsx`,
`workspace/draftRestoreRace.test.tsx`, which render `PdfSignTool` and `PdfRedactTool` together to test
the shared draft-restore path, and `text/textCoverage.test.js`, which imports Sign's
`components/textMessages.ts`) gave `editor` a genuine edge to `tool-sign` and `tool-redact`.
`check-module-boundaries.mjs` never sees it (it excludes test files by design), but Nx is right that it
exists: those tests exercise Sign, and a Sign-only commit that did not run them would be skipping
coverage it has. Turning inference off would have hidden that, not fixed it.

The fix is a leaf project for tests that deliberately span modules: `src/test/cross-tool/`
(`cross-tool-tests`), holding those three plus `src/lib/languageAcceptance.test.js`, which imports
`e2e/sign/fixtures/exportRenderCorpus.js` and so gave `lib` an edge to `fonts` (whose
`implicitDependencies` include `tool-sign`: a second cycle that also widened Sign to everything). Two
placements were tried and rejected on the graph itself: `src/test/` as the project (every tool imports
its helpers `setup.js`/`setInputFiles.js`/`fixtures/`, so the cycle came straight back), and leaving the
files where they were. Nothing imports from `src/test/cross-tool/`, so it can depend on tools without
any project depending on it. `scripts/affected-scope.mjs` already puts `src/test/` in every narrowed
`unit_paths`, so these tests run on every narrowed run regardless of which project Nx names.

Measured after the move (`nx show projects --affected --files=<file> --json`, cold graph):

```
src/tools/compress/PdfCompressTool.tsx   -> ["tool-compress","site-e2e"]
src/tools/merge/useMergeDraft.ts         -> ["tool-merge","site-e2e"]
src/tools/redact/PdfRedactTool.tsx       -> ["tool-redact","cross-tool-tests","site-e2e"]
src/tools/sign/PdfSignTool.tsx           -> ["tool-sign","cross-tool-tests","fonts","site-e2e"]
e2e/sign/fixtures/latinNameCorpus.js     -> ["fonts","cross-tool-tests"]
public/fonts/Kalam-Regular.ttf           -> ["font-assets","fonts","cross-tool-tests"]
src/test/cross-tool/textCoverage.test.js -> ["cross-tool-tests"]
src/test/setInputFiles.js                -> site, and so everything (every project imports it)
```

The rule for the future follows from this: **a test that imports more than one tool, or a tool from
inside a core folder, goes in `src/test/cross-tool/`.** Anywhere else it either widens every commit of
that tool to everything (inference sees the edge) or is skipped on that tool's commits (it would not
be, only because inference sees it).

Rule 6 of `test:module-boundaries` (DEBT-02) now enforces this placement directly: a test file outside
`src/test/cross-tool/` that imports a tool it does not belong to fails the checker, so a future test
that recreates the ARCH-20 problem goes red instead of silently widening every narrowed run again.

## The two Vitest/Playwright gotchas `arch-20-prep` found, reconfirmed on the real layout

1. **Trailing slash in every `vitest run <dir>` target.** `vitest run src/editor` would also match
   `src/editor-ui` as a substring; every `test` target here uses `src/editor/`, `src/tools/merge/`, etc.
   No tool name here is a prefix of another (`edit-pages`/`image-to-pdf`/`to-image` all differ enough),
   so this is a one-time risk, not an ongoing one, but the trailing slash stays regardless.
2. **A new, related one this branch found, not on the prep branch**: Playwright's CLI path arguments
   are substring filters against its whole discovered test list, not directory restrictions. A bare
   `"e2e/"` argument matches `src/tools/sign/e2e/sign-editor.spec.js` too (it contains `"e2e/"` as a
   substring), which would silently pull every tool's own e2e specs back into a run meant to narrow to
   `site-e2e` alone. Fixed with `siteE2eOwnPaths()`: it lists `e2e/`'s real direct children
   (`e2e/home/`, `e2e/demo/`, ...), excluding whatever is carved into its own project (`e2e/sign/`, the
   `fonts` project) via the same `roots` map `ownerOf()` already uses - so a future carve-out needs no
   second list to update. Caught only by exercising the CLI end to end; the unit tests for
   `deriveScope()` had passed a stub `siteE2ePaths` that ignored its own inputs, which is why they did
   not catch it - `scripts/affected-scope.test.mjs` now has a dedicated regression test for the bare-`e2e/`
   substring hazard and for `siteE2eOwnPaths()` itself. A second, unrelated bug found the same way:
   `toolE2eExists(project)` was being called on the already-mapped path string, not the project name,
   because the `.filter()` ran after the `.map()` - every tool's own e2e/ was silently dropping out of
   `e2e_paths` regardless of whether it existed. Both are fixed in the same commit
   (`8a49ceb`); see its message for the full detail.

## Where the `shell -> i18n` (formerly `lib -> i18n`) coupling still applies

`arch-20-prep` found `src/lib/useWorkspaceGestures.ts` had a genuine runtime import from
`src/i18n/toolMessages.ts` (`englishSignMessages`, `formatMessage`, `signElementTypeLabel`); ARCH-17/18
later moved that file to `src/tools/sign/useWorkspaceGestures.ts` (Sign's own folder, not `lib`), and
today it is `src/shell/` that carries the real edge instead (`RecentFiles.tsx`, `ToolShell.tsx`,
`BasePdfTool.tsx`, `FileDropzone.tsx`, `DropzoneEmptyState.tsx` all import from `src/i18n/`). Every
tool also has its own direct, permitted edge to `i18n` (module-boundaries rule 1). None of this widens
any change to `i18n` past what already happens: `shell` is one of `affected-scope.mjs`'s CORE_PROJECTS
(any change there is `everything` regardless of dependents) and `site` has its own real edge to `i18n`
(see above) - both already force `everything` on any `src/i18n/`-only change, independent of `i18n` now
having its own Nx project. This is real, pre-existing coupling worth knowing about if `shell`'s (or a
tool's) own dependents ever need to be enumerated precisely (e.g. if a future change narrows `site`
itself - see Follow-ups), and does not block anything here. It is also the reason `i18n` becoming its
own project could not, on its own, free `editor` from `CORE_PROJECTS` - see "Where this still falls
short" above and DEBT-07's "Investigated (2026-09-17)" note.

`editor-ui` left CORE_PROJECTS in DEBT-06 (2026-09-14): every consumer of `src/editor-ui/*` is Sign or
Redact (measured: `nx show projects --affected --files=src/editor-ui/ElementToolbar.tsx` answers
exactly `editor-ui, tool-sign, tool-redact, fonts, cross-tool-tests, site-e2e`), and the tool pages'
Tailwind `@source` lists name no island files, so there is no CSS side channel to a third tool. An
editor-ui-only change now narrows to Sign, Redact, `src/editor-ui/`'s own unit tests, and `src/test/`,
the same as any other narrowed change. `editor` stays in CORE_PROJECTS for now - DEBT-07 decides its
fate, after DEBT-04.

## Enforcement: `scripts/check-module-boundaries.mjs` stays the only checker

`@nx/enforce-module-boundaries` is an ESLint rule; this repo has no ESLint, and none of the five
prose rules in `docs/module-boundaries.md` map cleanly onto `depConstraints` syntax without a second,
custom rule for "a tool's own island is the only legal entry point." The project tags this record originally landed (`scope:tool`, `tool:merge`, ...) were read by
nothing and were deleted on 2026-09-24 (DEBT-14): projects are identified by name (`tool-*`), and
folders are the one definition of a boundary. `check-module-boundaries.mjs` is unchanged by ARCH-20 and remains green (249
files scanned, 815 edges, 0 allowlisted violations, matching ARCH-18/19's empty allowlist).

Cross-checked once: every inferred edge in `nx graph --file` runs in a direction the five rules allow
(tool -> core, core -> core, `cross-tool-tests` -> tools, `site-e2e`/`fonts` -> what their specs
exercise). No `editor -> editor-ui`/`shell`, no core -> tool, no tool -> tool edge exists in the
graph, which is the same answer the checker gives with an empty allowlist.

What narrows a single-tool commit past its own `unit_paths`/`e2e_paths` is only as good as the specs
actually staying inside that tool's folder. A `src/tools/<t>/e2e/*.spec.js` that also drives another
tool's page defeats that narrowing silently: a Redact-only commit still narrows to
`src/tools/redact/e2e/` plus `e2e/`, but a spec sitting under `src/tools/sign/e2e/` that also opens
`/redact` never runs. `docs/module-boundaries.md`'s rule 7 (`check-module-boundaries.mjs`'s
`toolSpecRouteViolations()`) is the guard: a spec under a tool's own `e2e/` folder may only reference
that tool's own routes, plus `/`, checked as a static string/regex-literal scan of the spec's source
text. A spec that genuinely needs another tool's page lives under `e2e/` instead, where it always runs
regardless of which single tool a commit narrows to (DEBT-01).

## The project table vs. the histogram

`scripts/nx-affected-histogram.mjs` classifies each of the last 200 commits on `HEAD`
(`1120dd1..6c87309`, re-run after the cross-tool move) with the real `affected-scope.mjs` logic - no pre-move regex table, unlike its
`arch-20-prep` predecessor, which needed one because the folders did not exist yet on that branch:

```
Buckets (of 200 commits classified, 0 script errors):
  docs_only:   47
  narrow:      10
  everything: 143
```

**Read this against when the folders actually landed, not as a verdict that narrowing does not work.**
This worktree forked immediately after ARCH-16 through ARCH-19 finished (`a80920d`
"ARCH-18: merge moves into src/tools/merge/" through `27c637f`, the last ~15 commits of the 200), so
roughly 90% of this window predates the layout this configuration targets. A commit from before the
move (e.g. `55f3a7c`, a Merge-only commit from before `a80920d`) still touched
`src/components/MergeTool/...`, a path no current project owns - correctly classified `everything` by
the "unowned file" rule, for the same reason a change to any file whose folder has since moved would be:
the mechanism is not wrong, the historical path is. None of the 10 `narrow` commits in this window
happen to touch a `src/tools/<tool>/` file directly, for the same reason - they are all pre-move commits
that happened to touch only `e2e/home/`, `e2e/demo/`, or `e2e/sign/` fixtures, folders that did not move.

The acceptance bar the ticket actually cares about - does a real, present-day single-tool change narrow
- is demonstrated directly against files that exist in the current tree, not against historical hashes:

```
src/tools/compress/PdfCompressTool.tsx  -> ["tool-compress","site-e2e"]                        fonts=false
src/tools/sign/PdfSignTool.tsx          -> ["tool-sign","cross-tool-tests","fonts","site-e2e"]  fonts=true
src/tools/redact/PdfRedactTool.tsx      -> ["tool-redact","cross-tool-tests","site-e2e"]        fonts=false
src/lib/format.js                       -> lib and its 16 dependents                          everything=true (core)
src/editor/model/editorModel.ts         -> editor and its dependents                          everything=true (core)
src/pages/index.astro                   -> site and its dependents                            everything=true (core)
playwright.config.js                    -> all 18 (nx.json sharedGlobal)                      everything=true
scripts/change-scope.mjs                -> []                                                 everything=true (unowned)
public/fonts/Kalam-Regular.ttf          -> ["font-assets","fonts","cross-tool-tests"]         fonts=true, narrow
e2e/home/handoff.spec.js                -> ["site-e2e"]                                       narrow, fonts=false
e2e/sign/fixtures/latinNameCorpus.js    -> ["fonts","cross-tool-tests"]                       narrow, fonts=true
```

Every acceptance example from the working brief holds on the current tree with one honest exception:
the specific historical hashes it named (`55f3a7c`, `204c9be`) predate the ARCH-18 move within this
fork's own history and do not resolve narrowly - see above. A `src/pages/*.astro` change resolving to
`everything` is expected and named as a known gap, not a bug: `.astro` files have no import edges any
plugin here infers, and `site` is one of the four core projects every tool depends on regardless.

## Follow-ups (not done here)

- **Split `site`** so a page-only or content-only commit narrows instead of forcing `everything`. Every
  tool imports `site`'s `i18n`/`data` today, so splitting it cleanly needs its own investigation (which
  of `src/pages/`, `src/layouts/`, `src/content/`, `src/data/`, `src/i18n/`, `src/styles/` a tool
  actually needs at runtime vs. build time) rather than a mechanical carve-out.
- **Shard-skipping for a small narrowed set**: today's `e2e` job always runs both shards even when the
  narrowed `e2e_paths` would leave shard 2 with nothing (`--pass-with-no-tests` makes that fast, not
  free - it still pays checkout/npm ci/browser install). Worth an `if:` gate once real-world runs show
  how often a narrow scope is small enough for one shard to cover it entirely.
- **A week of real CI runs** to replace this measurement with production numbers, per the ticket's own
  acceptance bar - this record's numbers are all from a single local checkout, not `ci.yml` in
  production. Left to whoever owns the ticket's Notes section next.

## ARCH-23 (2026-09-18): `fonts` narrowed to a file-glob; export guards split into their own project

Filed from CI run 35380358167: a commit touching only `src/editor-ui/ArmHint.tsx`,
`src/editor-ui/SignToolbar.module.css` and `src/tools/sign/components/SignToolbar.test.tsx` (a
tooltip's markup, its CSS, a unit test) ran all 27 font guards, because `fonts`
(`e2e/sign/project.json`) declared `editor`, `lib` and `tool-sign` as whole-project
`implicitDependencies` - Nx's directory-rooted model has no way to say "only the six specs that
navigate to `/sign`, not the other twenty-one" short of a real file move. `backlog/tasks/ARCH-23.md`
measured this edge across a 62-push window: **0 of 8** narrow-verdict `fonts=true` triggers in that
window were rightful, and the edge alone accounted for 25 of 44 historically-affected runs once
`wide()`'s own unconditional `fonts: true` is factored out.

**The owner's decision (Shlomi, 2026-09-18):** the font guards prove the shipped fonts comply; if no
font changed, they don't need to run per-push - a nightly cron (already shipped, `ci.yml`'s
`schedule:`, self-skipping via `nightly_unchanged`) is the backstop for any other code change during
the day.

**Two separate fixes landed together, because the 27 guards split into two different questions:**

1. **25 shaping/font-parity guards genuinely only need the font catalogue and the browser** (per-script
   guards, font parity suites, the Hebrew composition guard). `scripts/affected-scope.mjs` gained
   `matchesFontsGlob(file)`, a small, explicit, directory-scoped rule (`public/fonts/`,
   `src/editor/text/` as a whole directory, `src/styles/editorFonts.css`, `scripts/fonts/`,
   `scripts/generate-font-*`, `scripts/check-font-*`, `e2e/sign/`'s guard specs and fixtures,
   `playwright.config.js`), evaluated once per `deriveScope()` call and threaded into both the
   `CORE_PROJECTS` `wide()` call and the narrow-path return - replacing `affectedSet.has('fonts')`
   entirely. `fonts`' own `implicitDependencies` shrank to `['font-assets']`: it no longer needs
   `editor`/`lib`/`tool-sign` at all, because the CI decision no longer reads Nx's affected-set for this
   project. Every other `wide()` reason (an unowned file, the CI oracle, no resolvable base) keeps
   forcing `fonts: true` unconditionally, unchanged - only the core-project rule (rule 4) stopped being
   an automatic yes.

   **Design choice: (a), a file-glob, not a new `editor-text` Nx project.** Both were considered (a
   carved-out `editor-text` project rooted at `src/editor/text/` would give the same graph-based answer
   `tool-<name>` projects get). The glob wins on one measured fact: `src/editor/text/` mixes the
   catalogue (`fonts.js`, `fontManifest.js`, ...) with shaping/runtime code that shares the same
   directory (`bidiRuns.js`, `combPlacement.ts`, `dateFormat.ts`, `hebrewComposition.js`,
   `liveFontCoverage.js`, `textCoverage.js`, `textFontSupport.js`, `textMetrics.ts`,
   `textTransforms.js`) - a real Nx project is directory-rooted, so carving one out would need an actual
   file move (a bigger change than this ticket's saving justifies) or would still have to be
   directory-wide, which is exactly what the glob already is. `matchesFontsGlob` is deliberately a
   *directory* rule for `src/editor/text/` (not a named subset of catalogue files only), for the same
   reason: a shaping-code change there still runs the guards, on the same "ambiguous scope never
   narrows" principle every other rule in this file follows. Verified on the real tree:

   ```
   src/editor-ui/ArmHint.tsx + src/tools/sign/components/SignToolbar.test.tsx (15396adf-shaped)
                                             -> fonts=false, export_guards=true
   src/editor/text/combPlacement.ts         -> everything=true (editor is core), fonts=true (directory rule)
   src/lib/drafts/draftStore.js             -> everything=true (lib is core), fonts=false
   public/fonts/NewFont-Regular.ttf         -> fonts=true
   e2e/sign/some-new-shaping-guard.spec.js  -> fonts=true
   package-lock.json                        -> everything=true (unowned), fonts=true (unchanged, fail-open)
   ```

2. **The two guards that actually run the export pipeline** (`export-render-guard.spec.js`, which
   rasterises the real `signPdf` output against a runner-pinned baseline, and
   `language-acceptance.spec.js`, the same bundle over every shipped language/face combination) moved
   to a new top-level `e2e/export/` directory and a new `export-guards` Nx/Playwright project
   (`e2e/export/project.json`). Unlike `fonts`, this project *keeps* `editor`, `lib`, `tool-sign` and
   `font-assets` as coarse, whole-project `implicitDependencies` - deliberately, because these two specs
   really do exercise `src/editor/adapters/pdf/sign.js` and `src/tools/sign/languageAcceptance.js`, and
   at only two specs (well under a minute combined) the coarse edge costs nothing like the 27-guard
   version did. `export_guards` in `affected-scope.mjs`'s output is decided the normal way - Nx's
   affected-set, `affectedSet.has('export-guards')` - the same as any `tool-*` project, not a glob.
   `temporaryBundle.js` (the shared esbuild-and-serve fixture) stayed in `e2e/sign/fixtures/` rather
   than moving, because a `fonts` guard (`cjk-advance-parity-guard.spec.js`) and `shapingGuardHarness.js`
   still import it; the two moved specs import it across the directory boundary
   (`../sign/fixtures/temporaryBundle.js`) instead of duplicating it.

`playwright.config.js` gained an `EXPORT_GUARDS` glob and an `export-guards` project alongside `fonts`;
`ci.yml` gained an `export-guards` job (gated by `affected-scope`'s `export_guards` output the same way
`e2e` is gated by its own paths) and the exported-PDF baseline recapture step moved into it (the
`fonts-shard-1`/`fonts-shard-2` split no longer carries it - shard 1 dropped from seven named specs to
six, 175.5s to 157.8s, since the export render guard's 17.7s left with it).

## ARCH-28 (2026-09-25): unit tests by file impact, not by Nx project

Filed from ARCH-27's own numbers: on real pushes, `vitest related <changed files> --run` selected 2
files for an `editor` commit, 13 for a `lib` commit and 1 for a `shell` commit, where `deriveScope()`'s
`CORE_PROJECTS` rule ran all ~193 unit test files instead - 46 of 53 wide runs in the ARCH-22 window.
Nx's directory-rooted project graph can say "this file is in `lib`, and every tool depends on `lib`",
but it cannot say "this specific file in `lib` is imported by 13 test files" - only Vitest's own module
graph knows that.

**What changed:** `scripts/unit-scope.mjs` is a new, separate oracle for unit-test selection only.
`resolveUnitScope()` feeds the changed files straight to `vitest related <files> --run
--passWithNoTests`; `WIDEN_RULES`, a pure and unit-tested table, compensates for what that import graph
cannot see (a file read with `node:fs` instead of `import`, a test that scans the whole repository, or
global config that changes what "related" even means) by adding specific extra test files or widening
the whole push to the full suite. Nx's own `deriveScope()`/`unit_paths` is untouched - it still exists
and still backs `e2e_paths` - but the unit step no longer reads it at all, so a `CORE_PROJECTS` verdict
(`site`/`shell`/`editor`/`lib`) that used to force `everything=true` for units no longer does. See
`.claude/rules/tests.md`'s "Unit-by-impact selection" section for the day-to-day summary, and
`scripts/unit-scope.mjs`'s own header comment for the mechanism in full, including the one fact this
leans on throughout: passing a *test* file's own path as a `vitest related` seed selects exactly that
file (Vitest seeds its `affected` set with the `related` list itself before walking import edges
backwards from it), so a widen rule's extra tests are just more seeds in the same call - no second
Vitest invocation needed.

**Blind-spot inventory:** every `WIDEN_RULES` row is backed by a dedicated audit of the 199 unit test
files this repo runs, checking each one for `fs.readFileSync`/`readdirSync`/`spawnSync`/directory-walk
reads (things `import` cannot see), Vite-specific import kinds (`?raw`/`?url`/CSS Modules/dynamic
`import()` - only CSS Modules and dynamic `import()` are actually used here, and both were measured to
work correctly with no rule needed), global inputs (`vitest.config.js`, `tsconfig*.json`, `package*
.json` - all confirmed zero-selection blind spots; `src/test/setup.js` and the `astro:content` alias
target were the pleasant surprises, already handled correctly by Vitest itself), whole-repository guard
tests (`pdfRender.test.js`, `noCamelCaseSvgAttrs.test.js`, the import-scan guard,
`backlog-data.test.mjs`), and deletions/renames (`vitest related` on a missing path exits 0 with zero
tests, silently - the danger case a script has to catch itself, not something Vitest flags).

**Renames vs. deletions:** `changedFilesWithStatus()` (`change-scope.mjs`) is a second, ARCH-28-only diff
function, used only by `unit-scope.mjs`. Unlike `changedFiles()`'s deliberate `--no-renames` (kept for
Nx *ownership* - DEBT-03 wants both a rename's source and destination folder affected independently),
this one leaves git's rename detection on (`-M`): a real content-preserving move reports only its
destination, with status `A` - the same import edges as before still exist there, so `vitest related`
needs nothing special. Only a genuine, unpaired deletion keeps status `D`, and that widens the whole
push to the full suite - a basename/path git-grep at the base commit to find surviving coverage more
precisely was considered and rejected: a generic basename both false-positives (an unrelated file of the
same name) and false-negatives (a re-export hides the real reference) too easily to trust for something
CI treats as authoritative.

**Measured, on this tree (uncommitted single-file edits, reverted after each measurement):**

```
src/lib/drafts/draftStore.js            old: everything=true (193 files)   new: 6 seeds, vitest related -> 18 test files, ~9.5s
src/editor/model/editorModel.ts         old: everything=true (193 files)   new: 4 seeds, vitest related -> 3 test files, ~1.9s
src/shell/BasePdfTool.tsx               old: everything=true (193 files)   new: 5 seeds, vitest related -> 18 test files, ~9.5s
src/tools/sign/PdfSignTool.tsx          old: 63 files (5 Nx projects)      new: 5 seeds, vitest related -> 7 test files, ~8.7s
src/pages/pdf-to-image.astro            old: everything=true (193 files)   new: 2 seeds (the file + the import-scan guard, rule whole-src-import-scan, added after review) -> 1 test file
vitest.config.js                        old: everything=true (193 files)   new: widen rule "vitest-config" -> everything (193 files) - unchanged, correctly
src/lib/__fixtures__/num-1.pdf          old: everything=true (193 files)   new: widen rule "lib-pdf-fixtures" -> 12 seeds, vitest related -> 11 test files, ~9.3s
```

`BasePdfTool.tsx` and `draftStore.js` land at a similar file count to `PdfSignTool.tsx` only because both
are genuinely imported broadly (every tool's shell, or every tool's draft persistence) - the point isn't
that every file narrows to a handful, it's that the number now reflects the real import graph instead of
which of four buckets (`site`/`shell`/`editor`/`lib`) a folder happens to sit in. Wall-clock time barely
moves at this file count (Vitest's own worker/transform startup dominates under ~20 test files either
way - the whole 199-file suite itself runs in ~16s), so the win here is what a run actually re-executes
and what a CI summary shows as the reason, not raw seconds; a large multi-tool push would still see a
real time reduction the same way the ARCH-20 project-level narrowing already did.

**Deferred, not done here:** an audit of past CI unit-step failures against this implementation, to
confirm the new selection would not have skipped a test that actually caught a regression - the ticket
was deliberately left `in_progress` for this. `unit-scope.mjs` exports `resolveUnitScope({ explicitBase,
explicitHead })` for exactly this: for a historical push, it returns `{ all, seeds, reasons }`; when
`all` is true the audit trivially passes (everything ran), and otherwise the auditor should check out
that push's tree and run `npx vitest related <...seeds> --run --reporter=json --outputFile=<tmp>`, then
compare the resulting JSON's `testResults[].name` against the actual failing test file from that CI run.
This executes the tests (there is no side-effect-free way to get Vitest's own module-graph expansion
otherwise), so it is slow across many commits, but it is the only way to get the exact set Vitest itself
would select.
