# Troubleshooting: symptoms that look like one bug and are another

Read this **before** debugging when an island silently does nothing, a whole Playwright suite goes red
at once, or hydration dies with `Cannot read properties of undefined (reading '__H')`. Every entry here
was diagnosed the slow way at least once; each one names the tell that separates it from its
look-alikes. The CSP cause is in `.claude/rules/csp-scripts-pwa.md`; the service-worker cause is under
"PWA" in the same file.

## A whole Playwright suite going red at once

**A whole Playwright suite going red at once usually means it tested the wrong build, not that the
build broke.** Two things about the preview server cause this, and both look like something else:

- **`playwright.config.js` reuses whatever is already listening on its port** (4173 by default,
  `reuseExistingServer` outside CI). Worktrees share a port namespace, so a stray `astro preview` left
  running by *another worktree of this repo* is silently accepted, and every spec then runs against a
  different project's `dist/`. The tell is uniform failure with locators timing out on elements that
  obviously exist: the suite is not finding your markup because your markup is not being served.
  Check what owns the port before believing the result:
  `lsof -a -p <pid> -d cwd -Fn` prints a listening process's worktree.
- **`astro preview` allows exactly one instance per project**, managed as a daemon. A second
  `npm run preview` does not start and does not crash; it prints "Preview server already running at
  ..." and exits 0, which reads like a mysterious early exit when Playwright launches it. Use
  `npx astro preview stop` and restart on the port you want, rather than adding a second one. A running
  preview serves `dist/` from disk, so a rebuild is picked up with no restart.

The practical rule for parallel agents: **one preview, on 4173, for the whole worktree**, and let
everything share it. Handing each agent its own port does not work and quietly produces the first
failure mode above.

## "File selection does nothing": five causes, one symptom

The CSP cause (production only, works in dev) is the first to suspect on a deployed build; see the CSP rule. The other four:

**If a tool's file picker opens but selecting files does nothing in `npm run dev`**, and the browser console shows `504 (Outdated Optimize Dep)` for entries under `node_modules/.vite/deps/`, the dev server's Vite dependency cache has gone stale relative to `node_modules` — typically because `npm install` ran while an old `astro dev` process was still running. The dynamic import of the island component then fails (`[astro-island] Error hydrating ... Failed to fetch dynamically imported module`), so its `onChange` handler never attaches — same end-user symptom as the CSP hydration bug below, different cause, and only happens in dev. Fix: stop the dev server, `rm -rf node_modules/.vite`, restart `npm run dev`.

This same stale-dep-cache class can also surface as a **503** (not just 504) on a specific pre-bundled dep — e.g. `node_modules/.vite/deps/sortablejs.js` returning 503, which cascades into the *importing* island failing with the same `[astro-island] Error hydrating ... Failed to fetch dynamically imported module` error, even though the failing request is a transitive dependency, not the component file itself. Diagnose by checking the Network tab (not just console) for any non-200 response under `node_modules/.vite/deps/` or `node_modules/<pkg>/` during the page load that hydration-errored — the failing dep points at what to blame, and the symptom is identical across every tool since they all share `BasePdfTool.jsx`'s hydration path (don't assume a per-tool code bug just because it reproduces on multiple tool pages). Same fix: kill the dev server, `rm -rf node_modules/.vite`, restart. A `.astro/dev.log` reference to a different/old project directory path is a stale leftover from a prior crashed run (e.g. before a repo rename) and is *not* diagnostic of the current process — check the currently-running PID's actual behavior instead of trusting old log lines.

**A third way "file selection does nothing" happens, and the only one jsdom cannot catch: reading `input.files` after resetting `input.value`.** `<input type=file>.files` is a *live* FileList, and assigning `value = ''` (which every handler here does, so re-picking the same file still fires `change`) empties it in place. Read the list into an array *before* clearing the input. This is invisible under Vitest because the tests install `files` with `Object.defineProperty`, which survives the reset — so `npm test` passes completely and the built app silently does nothing on every tool at once. Same end-user symptom as the CSP and stale-dep-cache bugs above; different cause, and the tell is that it reproduces in `npm run dev` too, with no console error and no CSP violation.

**A fourth cause, and the one to suspect first when clearing `node_modules/.vite` does *not* help: an incomplete `vite.optimizeDeps.include` in `astro.config.mjs`.** Every dep Vite discovers *late* (i.e. reachable only from inside an island, so its startup crawl of the `.astro` entry points never sees it) bumps the dep optimizer's `browserHash`, and every module already resolved under the previous hash then fails as `504 (Outdated Optimize Dep)`. Vite's recovery is a full reload pushed over HMR, so *one* late discovery is survivable. Several in a single page load are not: they strand the astro-island bootstrap and the Astro dev toolbar together, the toolbar's own dynamic import throws inside `initApp` (`Cannot read properties of undefined (reading 'send')`, repeated), and the HMR channel dies before the rescue reload is ever sent. The page is then stuck with two optimizer generations of Preact at once, and hydration dies in `preact_hooks` on **`Cannot read properties of undefined (reading '__H')`** — `preact/hooks` from one generation reading `currentComponent.__H` out of the other's module state. The island never mounts, so the tool's file input does nothing and a loaded PDF silently never renders. Clearing `node_modules/.vite` is useless here: the next cold load rebuilds the identical cascade, which is the tell that distinguishes this from the stale-cache causes above. **Diagnose by `?v=` hash, not by console text**: in the Network tab every `/node_modules/.vite/deps/` request should carry one shared hash (plus a second, separate one for Astro's dev-toolbar environment, which legitimately runs its own optimizer). Three or more distinct hashes in one load means the cascade. `preact.js` and `preact_hooks.js` disagreeing is the specific fatal case. Fix by adding the offending package to `optimizeDeps.include` — do not disable the dev toolbar, which is collateral rather than cause. Test cold and in an Incognito window, since this only reproduces on a first load against a fresh optimizer cache. This shipped incomplete once: the list covered the five deps behind an explicit `import()` but missed three ordinary top-level imports inside islands (`signature_pad`, `lucide-preact`, `@vercel/analytics`), which is the easy assumption to repeat — **being statically imported does not make a dep visible to the startup crawl if the only path to it is through an island.**

**A freshly-created `git worktree` needs its own `npm install` before running tests — a missing or partial `node_modules` there breaks CSS Modules silently, not just the dev server.** If a worktree directory happens to contain *any* `node_modules` folder — even an empty one, or one holding only leftover `.astro`/`.vite` cache directories from a stray build/test run — Node's module resolution stops there instead of walking up to the real install in the main checkout, since Node stops at the first `node_modules` it finds. Most imports still resolve fine (Vite/Rollup's own resolver falls through to the parent anyway), but two things break in a way that's easy to misdiagnose: (1) **CSS Modules under Vitest silently resolve to `{}`** — `import styles from './X.module.css'` gives you `styles.foo === undefined`, so `class={styles.foo}` renders `class="undefined"`, `container.querySelector('.foo')` returns `null`, and every test touching that class fails with no error pointing at the real cause; (2) pdfjs's `new URL('pdf.worker.mjs', import.meta.url)` asset resolution gets rewritten against the worktree's phantom path instead of the real `node_modules`, breaking any test that spins up a real pdf.js worker. Both look like ordinary test failures, not an environment problem. Fix: `rm -rf` the worktree's stray `node_modules`, then run `npm install` inside the worktree — don't assume a worktree can safely share or skip installing its own `node_modules` just because the main checkout has one.

## Playwright tests that fetch more than one dynamically-served asset

**A Playwright test that fetches more than one dynamically-served asset must block service workers.**
`test.use({ serviceWorkers: 'block' })`. The app's own production service worker takes control partway
through a page load and then serves fetches from inside its own execution context, where `page.route()`
cannot see them - so an interception that works for the first asset silently 404s on the second. Found
while screening candidate Arabic fonts against the preview build, and it costs an hour to diagnose
because the first fetch succeeding makes the interception look correct.


