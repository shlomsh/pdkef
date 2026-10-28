---
id: "SEO-49"
title: "A commit that only restructures code no longer re-dates a page's lastmod"
status: "done"
priority: "P2"
epic: "search-and-languages"
---

# SEO-49 · A commit that only restructures code no longer re-dates a page's lastmod

## Problem

The sitemap's `<lastmod>` and the content pages' visible "Last updated" line both come from
`src/site-lib/gitLastModified.js`: the git commit date of the files that back a URL. A refactor that touches
those files moves the date with no word on the page changing. ARCH-101 (`0e5a8013`, src/lib grouped by domain)
and ARCH-44 (`4df014c3`, cross-layer imports rewritten to `#lib/`-style aliases) each changed one dynamic
`import()` specifier in a home component, and `/` and `/he/` were re-dated to 2026-10-28 both times. Google
learns to ignore a `<lastmod>` that moves without the page changing, and it is the only freshness signal the
sitemap carries. The build id hashes dist, so the same churn reached `about/index.html`, `sw.js` and the
precache manifest.

## Decision: a checked-in list, `.git-blame-ignore-revs`

Structure-only commits are listed by full hash in `.git-blame-ignore-revs`, and the date lookups skip them, the
way `git blame --ignore-revs-file` does. Why this over classifying each diff (skip a commit whose change to the
file is only `import` / `export ... from` lines):

- **Explicit and deterministic.** Whether a commit is structure-only is decided once, by the person who made it,
  and is reviewable in one file. A diff classifier has to guess: both commits here changed a dynamic `import()`
  inside a function, not an import statement, and an import that swaps one component for another is a visible
  change that a line pattern would wrongly skip.
- **No parsing.** The lookup reads the next commit back instead of interpreting patches, for whole files,
  directories (`src/components/home`) and `-L` line ranges (a tool's registry entry) alike.
- **One list, two readers.** The file name is git's convention: GitHub's blame view already honours it, and
  `git config blame.ignoreRevsFile .git-blame-ignore-revs` makes local blame skip the same commits.

The cost is one line per refactor, added in a follow-up commit once the refactor is on `main` with its final
hash. A rebase would rewrite a listed hash silently, so a unit test fails when a listed hash is not in history
(skipped on a shallow clone, which cannot tell).

## What a listed commit can and cannot do

- It only moves a date back to the last real change. A file that listed commits alone have touched (a file a
  refactor created or moved) keeps its newest commit's date rather than losing it.
- "No `<lastmod>`" stays reserved for a date git cannot know: a shallow boundary commit is still refused, after
  the skip, exactly as before.
- The lookup asks git for at most `list size + 1` commits per path, since each listed commit can appear once.

## Acceptance (verified 2026-10-28 on `audit-structure` at `f66fb1de`, two production builds)

- [x] Failing tests first (`src/site-lib/gitLastModified.test.js`): a temp repo with a content commit, a listed
  import-rewrite commit and the list; a file, a directory and a tool entry date to the content commit; a file only
  the listed commit touched keeps its date. Plus guards on the real list: full hashes, each in history.
- [x] `/` and `/he/` carry `2026-10-27T18:11:07.000Z`, the date they had before `0e5a8013` and `4df014c3`.
- [x] Every other URL's `<lastmod>` is unchanged.
- [x] `scripts/unit-scope.mjs` reruns the test when the list changes (it is read by path, not imported).
