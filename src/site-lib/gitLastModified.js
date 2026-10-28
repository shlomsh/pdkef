// Build-time only: shells out to git, so it must only ever be imported from
// Astro frontmatter or prerendered endpoints, never from anything that can
// reach a browser bundle.
//
// One source of truth for "when did this page's content last change". The
// sitemap's <lastmod> (SEO-01) and the visible "Last updated" line on the
// content pages (SEO-29) both read it, so the date a reader sees is the date
// Google is told, by construction. It is derived from the git commit date of
// the file(s) that back a URL, never hand-maintained, so it cannot drift out
// of sync with what actually changed.
//
// 2026-09-14 incident: Vercel's default production clone is `--depth 10` and
// CI's `actions/checkout@v5` defaults to `--depth 1`. On a shallow clone,
// `git log -1 -- <file>` for any file not touched inside the shallow window
// returns the shallow BOUNDARY commit: git grafts that commit in as a root
// with no parents, and treats it as adding every file in the tree (the diff
// against nothing), so every such file got dated with the boundary commit
// instead of its real history. Reproduced: `git clone --depth 10` then
// `git log -1 --format="%h %cI" -- src/content/content-pages/offline-pdf-form-filler.yaml`
// printed `714dd08 2026-09-14T21:15:04+03:00`; the full clone prints
// `b4ffd96 2026-08-29T11:13:52+03:00`. Every guide's "Last updated" line and
// the sitemap's <lastmod> told readers and Google that the page had changed
// "recently" when no sentence had, and the previous BUILD_TIME fallback
// (used whenever git history wasn't available at all) had the identical
// effect: a value that looks legitimate but is not the truth. The sitemap's
// own comment already states the policy this violated - "an inaccurate one
// is worse than none."
//
// The fix is to detect the boundary and refuse to date from it:
// gitFileLastModifiedIso returns null (rather than the boundary commit's
// date, rather than a build timestamp) whenever the only commit git can find
// for a file is a shallow boundary, and lastModifiedFor returns null when no
// file in its list has a real date. Every caller omits the "Last updated"
// line and the <lastmod> entry entirely in that case, rather than print a
// value that isn't true. The other half of the fix, so this rarely fires on
// the builds that matter, is giving them real history:
// `VERCEL_DEEP_CLONE=true` on the Vercel project and `fetch-depth: 0` on
// ci.yml's `build` job, which runs test:seo - the guard that now fails a
// build carrying an undated page - and on `checks`, whose unit run includes
// this module's test against real history.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

let isShallowCache = null;

function isShallowRepository() {
  if (isShallowCache === null) {
    try {
      isShallowCache =
        execSync('git rev-parse --is-shallow-repository', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() === 'true';
    } catch {
      // expected: build-time script, a failed git probe means not shallow
      isShallowCache = false;
    }
  }
  return isShallowCache;
}

const gitDateCache = new Map();

// Structure-only commits (SEO-49): ARCH-101 moved src/lib into folders and
// ARCH-44 rewrote cross-layer imports to `#lib/`-style aliases. Neither
// changed a word on any page, yet both touched home components, so `/` and
// `/he/` took the refactor's date. Such commits are listed by full hash in
// `.git-blame-ignore-revs` (the file `git blame --ignore-revs-file` and
// GitHub's blame view already read), and the lookups below skip them. A
// listed commit only ever moves a date back to the last real change: a file
// that listed commits alone have touched keeps its newest one, because "no
// date" stays reserved for a shallow clone that cannot know.
const ignoredRevsCache = new Map();

function ignoredRevs(cwd) {
  const key = cwd ?? '';
  if (!ignoredRevsCache.has(key)) {
    let revs = [];
    try {
      revs = fs
        .readFileSync(cwd ? `${cwd}/.git-blame-ignore-revs` : '.git-blame-ignore-revs', 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    } catch {
      // expected: build-time script, no list means no commit is skipped
    }
    ignoredRevsCache.set(key, new Set(revs));
  }
  return ignoredRevsCache.get(key);
}

const COMMIT_MARK = 'lastmod-commit';

// `git log` args (a path or a `-L` range) whose newest commit dates the
// content, skipping listed structure-only commits. Null when git has nothing
// or the commit it picks is a shallow boundary (see the header comment).
// Shared by the whole-file and the entry-range lookups so both refuse the
// boundary and skip the list the same way. Each listed commit can appear at
// most once, so the first `list size + 1` commits hold the answer.
function lastCommitIso(logArgs, cwd) {
  const ignored = ignoredRevs(cwd);
  try {
    const commits = execSync(
      `git log -n ${ignored.size + 1} --format=${COMMIT_MARK}%x09%H%x09%cI%x09%P ${logArgs}`,
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        ...(cwd ? { cwd } : {}),
      },
    )
      .split('\n')
      // `-L` prints each commit's patch after its line; keep only our lines.
      .filter((line) => line.startsWith(`${COMMIT_MARK}\t`))
      .map((line) => {
        const [, hash, dateIso, parents = ''] = line.split('\t');
        return { hash, dateIso, parents };
      });
    const commit = commits.find(({ hash }) => !ignored.has(hash)) ?? commits[0];
    if (!commit) return null;
    // A shallow boundary commit is grafted with no parents and stands in
    // for the entire history git could not fetch, so it "touches" every
    // file in the tree whether or not that file actually changed there -
    // see the header comment. Only trust it when the clone isn't shallow.
    const isShallowBoundary = isShallowRepository() && commit.parents.trim() === '';
    return isShallowBoundary ? null : new Date(commit.dateIso).toISOString();
  } catch {
    // expected: build-time script, no git date falls back to null
    return null;
  }
}

export function gitFileLastModifiedIso(file, { cwd } = {}) {
  const key = `${cwd ?? ''}\0${file}`;
  if (gitDateCache.has(key)) return gitDateCache.get(key);
  const iso = lastCommitIso(`-- "${file}"`, cwd);
  gitDateCache.set(key, iso);
  return iso;
}

// Sitemap churn fix: `src/data/tools.js` holds every tool's copy, so dating a
// tool by the file re-dated all the tool pages whenever any one of them was
// edited (seven commits on 2026-09-28 stamped every tool page with the last
// one's date). Google learns to ignore a <lastmod> that moves without the
// page changing, and this is the only freshness signal the sitemap carries.
// Each entry in the registry is a `  {` ... `  },` block with a `slug:` line,
// so a tool is dated by the history of its own block's lines.
/** @testSeam */
export function toolEntryLineRange(source, slug) {
  const lines = source.split('\n');
  const slugLine = lines.findIndex((line) => line.trim() === `slug: '${slug}',`);
  if (slugLine === -1) return null;
  let start = slugLine;
  while (start >= 0 && lines[start] !== '  {') start -= 1;
  let end = slugLine;
  while (end < lines.length && lines[end] !== '  },') end += 1;
  if (start < 0 || end >= lines.length) return null;
  return { start: start + 1, end: end + 1 };
}

export function gitToolEntryLastModifiedIso(slug, { file = 'src/data/tools.js', cwd } = {}) {
  const key = `${cwd ?? ''}\0${file}#${slug}`;
  if (gitDateCache.has(key)) return gitDateCache.get(key);
  let iso = null;
  try {
    const range = toolEntryLineRange(fs.readFileSync(cwd ? `${cwd}/${file}` : file, 'utf8'), slug);
    if (range) {
      iso = lastCommitIso(`-L ${range.start},${range.end}:"${file}"`, cwd);
    }
  } catch {
    // expected: build-time script, an unreadable file falls back to null
    iso = null;
  }
  gitDateCache.set(key, iso);
  return iso;
}

export function lastModifiedFor(files, { cwd } = {}) {
  let latest = null;
  for (const file of files) {
    const iso = gitFileLastModifiedIso(file, { cwd });
    if (iso && (!latest || iso > latest)) latest = iso;
  }
  return latest;
}

// The files whose git history dates a documentation page: the YAML that holds
// the copy the reader sees, and nothing else. The shared route template used
// to count too, on the theory that a template change is a change on every
// page; in practice DEBT-05 changed one import line in `[contentPage].astro`
// and every English guide's "Last updated" jumped to that day, telling
// readers and the sitemap that ten pages changed when no sentence had. A
// template change that does alter what a reader sees on every page is rare
// enough to be a deliberate decision: touch the YAML files in that commit, or
// accept that the date stays with the words. A localized edition maps to its
// own translation file, which carries the reviewed copy.
export function documentationSourceFiles(pageId, locale = 'en') {
  if (locale === 'en') {
    return [`src/content/content-pages/${pageId}.yaml`];
  }
  return [`src/content/localized-pages/${locale}/${pageId}.yaml`];
}
