---
id: "DEBT-68"
title: "The guidance guards judge only files git knows about"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-68 · The guidance guards judge only files git knows about

*Filed and closed 2026-10-28.*

## Why

`npm run check:guidance` is the first step of `check:fast` and `check:push`. It read the filesystem
(`globSync`, `readdirSync`), so the impeccable plugin's gitignored files in an app-made worktree
(`.claude/skills/impeccable/reference/*.md`, `.claude/agents/impeccable-*.md`) failed it: they cite
`src/App.jsx`, `public/css/` and other paths that do not exist here. CI never has those files, so CI
passed while every local gate stopped at its first step. Landing SEO-49 needed a scratch worktree and
`npm ci` just to get a green local gate.

## Outcome

- `scripts/repo-files.mjs` lists what git tracks plus new files not yet ignored (`git ls-files -co
  --exclude-standard`, the set `check-js-typed.mjs` already uses). `scanRepo` (cited paths) and
  `check-guidance-budget.js` (rule files, `paths:` globs, core-folder coverage) filter through it.
- A new file you have not `git add`ed yet is still checked, so the loop catches it before the commit;
  a gitignored file is not.
- Every check on tracked files is unchanged: `.claude/agents/implementer.md` is still scanned.

## Result

- Red run: the new `scanRepo only scans files git knows about` test in
  `scripts/check-cited-paths.test.mjs` failed first, flagging `.claude/agents/impeccable-applier.md`
  and `.claude/skills/impeccable/reference/live.md` from a temp repo. It also asserts a tracked file
  and an untracked, unignored file are still flagged.
- `npm run check:guidance` in this worktree (impeccable files present) went from a wall of
  "cites ..., which does not exist" to "Guidance budget OK".

## Follow-up 2026-10-28: the existence check had the same blind spot

The first version filtered which files were scanned but still asked the filesystem whether a cited path
exists. Two comments cited the gitignored plugin folder, so they passed locally and failed CI (run
40734516378). `scanRepo` now answers "does it exist" from the same git-known set (`repoPathExists`: a
file git knows, or a folder holding one). Red test first: a doc citing a path that exists only as a
gitignored file is flagged, a tracked folder and file are not. The two comments no longer name the
plugin's folder.
