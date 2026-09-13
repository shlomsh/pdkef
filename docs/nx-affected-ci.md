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

Eighteen `project.json` files, no workspace conversion, no per-project `package.json`, `nx.json` at
the repo root, `.nx/` gitignored:

| Project | Root | Tags | `test` | `e2e` |
| --- | --- | --- | --- | --- |
| `shell` | `src/shell` | `scope:shell` | ✓ | - |
| `editor` | `src/editor` | `scope:editor` | ✓ | - |
| `editor-ui` | `src/editor-ui` | `scope:editor-ui` | ✓ | - |
| `lib` | `src/lib` | `scope:lib` | ✓ | - |
| `site` | `src` (not the repo root - see below) | `scope:site` | ✓ | - |
| `tool-merge` | `src/tools/merge` | `scope:tool`, `tool:merge` | ✓ | ✓ |
| `tool-sign` | `src/tools/sign` | `scope:tool`, `tool:sign` | ✓ | ✓ |
| `tool-redact` | `src/tools/redact` | `scope:tool`, `tool:redact` | ✓ | ✓ |
| `tool-compress` | `src/tools/compress` | `scope:tool`, `tool:compress` | ✓ | ✓ |
| `tool-security` | `src/tools/security` | `scope:tool`, `tool:security` | ✓ | ✓ |
| `tool-split` | `src/tools/split` | `scope:tool`, `tool:split` | ✓ | - (no `e2e/` folder yet) |
| `tool-edit-pages` | `src/tools/edit-pages` | `scope:tool`, `tool:edit-pages` | ✓ | - |
| `tool-to-image` | `src/tools/to-image` | `scope:tool`, `tool:to-image` | ✓ | - |
| `tool-image-to-pdf` | `src/tools/image-to-pdf` | `scope:tool`, `tool:image-to-pdf` | ✓ | - |
| `font-assets` | `public/fonts` | `scope:font-assets` | ✓ (`test:fonts`) | - |
| `fonts` | `e2e/sign` (nested inside `site-e2e`'s own root) | `scope:fonts` | - | ✓ |
| `site-e2e` | `e2e` | `scope:site` | - | ✓ |
| `cross-tool-tests` | `src/test/cross-tool` (nested inside `site`'s root) | `scope:tests` | ✓ | - |

`fonts`' `implicitDependencies`: `font-assets`, `editor`, `lib`, `tool-sign` - the export pipeline the
27 font screening guards actually exercise. `site-e2e`'s `implicitDependencies`: `site`, `shell`, and
every `tool-*` project - Playwright specs have no import edges Nx can infer on their own.

`scripts/affected-scope.mjs` is the oracle, never the executor: it asks
`nx show projects --affected --files=<changed files>` once, then CI runs ONE `vitest run <paths>` and
ONE `playwright test <paths>` per shard, filtered by what it prints. `nx run <project>:test` targets
still exist on every `project.json` for local `npx nx run <project>:test`/`npx nx run-many -t test`
use, but nothing in `ci.yml` or `package.json` calls them.

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
`npx playwright test ${e2e_paths}` (one process per shard), never `nx affected -t test`/`-t e2e`.

## The root-project trap, confirmed again

`arch-20-prep` found that a project rooted at the repo root itself (`sourceRoot: "."`) gets outgoing
edges from `@nx/js`'s import inference but zero incoming ones - `site` must live at `src/project.json`
(`sourceRoot: "src"`), not at the repo root, or nothing can ever depend on it in Nx's own graph. This
branch keeps `@nx/js` for its import inference (see below), so the placement matters here too: `site`'s `project.json` lives at `src/project.json`, not
the repo root, so root-level files with no other home (`scripts/`, `docs/`, `backlog/`, `middleware.ts`,
config files) are claimed by no project - which is exactly what `scripts/affected-scope.mjs`'s "unowned
file -> everything" rule is built to handle, not a gap to close.

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
   not catch it - `src/lib/affectedScope.test.js` now has a dedicated regression test for the bare-`e2e/`
   substring hazard and for `siteE2eOwnPaths()` itself. A second, unrelated bug found the same way:
   `toolE2eExists(project)` was being called on the already-mapped path string, not the project name,
   because the `.filter()` ran after the `.map()` - every tool's own e2e/ was silently dropping out of
   `e2e_paths` regardless of whether it existed. Both are fixed in the same commit
   (`8a49ceb`); see its message for the full detail.

## Where `docs/module-boundaries.md`'s `lib -> i18n` coupling still applies

`arch-20-prep` found `src/lib/useWorkspaceGestures.ts` has a genuine runtime import from
`src/i18n/toolMessages.ts` (`englishSignMessages`, `formatMessage`, `signElementTypeLabel`), which
widens any i18n-only change to all of `lib`'s dependents. Since `lib` is one of `affected-scope.mjs`'s
five CORE_PROJECTS (any change there is `everything` regardless of dependents), this coupling changes
nothing about what `affected-scope.mjs` outputs today - a `src/i18n/` change is owned by `site` (also a
core project) anyway, so it is `everything` either way. It remains real, pre-existing coupling worth
knowing about if `lib`'s own dependents ever need to be enumerated precisely (e.g. if a future change
narrows `site` itself - see Follow-ups), and does not block anything here.

## Enforcement: `scripts/check-module-boundaries.mjs` stays the only checker

`@nx/enforce-module-boundaries` is an ESLint rule; this repo has no ESLint, and none of the five
prose rules in `docs/module-boundaries.md` map cleanly onto `depConstraints` syntax without a second,
custom rule for "a tool's own island is the only legal entry point." Nx's tags (`scope:tool`,
`tool:merge`, ...) exist purely so `nx show projects --affected` can be asked "which tool is this,"
not for enforcement - `check-module-boundaries.mjs` is unchanged by ARCH-20 and remains green (249
files scanned, 815 edges, 0 allowlisted violations, matching ARCH-18/19's empty allowlist).

Cross-checked once: every inferred edge in `nx graph --file` runs in a direction the five rules allow
(tool -> core, core -> core, `cross-tool-tests` -> tools, `site-e2e`/`fonts` -> what their specs
exercise). No `editor -> editor-ui`/`shell`, no core -> tool, no tool -> tool edge exists in the
graph, which is the same answer the checker gives with an empty allowlist.

## The project table vs. the histogram

`scripts/nx-affected-histogram.mjs` classifies each of the last 200 commits on `HEAD`
(`8027a2b..27c637f`) with the real `affected-scope.mjs` logic - no pre-move regex table, unlike its
`arch-20-prep` predecessor, which needed one because the folders did not exist yet on that branch:

```
Buckets (of 200 commits classified, 0 script errors):
  docs_only:   53
  narrow:      10
  everything: 137
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
plugin here infers, and `site` is one of the five core projects every tool depends on regardless.

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
