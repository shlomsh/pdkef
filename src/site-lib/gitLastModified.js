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
      isShallowCache = false;
    }
  }
  return isShallowCache;
}

const gitDateCache = new Map();

export function gitFileLastModifiedIso(file) {
  if (gitDateCache.has(file)) return gitDateCache.get(file);
  let iso = null;
  try {
    const out = execSync(`git log -1 --format=%cI%x09%P -- "${file}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) {
      const [dateIso, parents = ''] = out.split('\t');
      // A shallow boundary commit is grafted with no parents and stands in
      // for the entire history git could not fetch, so it "touches" every
      // file in the tree whether or not that file actually changed there -
      // see the header comment. Only trust it when the clone isn't shallow.
      const isShallowBoundary = isShallowRepository() && parents.trim() === '';
      if (!isShallowBoundary) iso = new Date(dateIso).toISOString();
    }
  } catch {
    iso = null;
  }
  gitDateCache.set(file, iso);
  return iso;
}

export function lastModifiedFor(files) {
  let latest = null;
  for (const file of files) {
    const iso = gitFileLastModifiedIso(file);
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
