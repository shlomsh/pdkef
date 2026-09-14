// Build-time only: shells out to git, so it must only ever be imported from
// Astro frontmatter or prerendered endpoints, never from anything that can
// reach a browser bundle.
//
// One source of truth for "when did this page's content last change". The
// sitemap's <lastmod> (SEO-01) and the visible "Last updated" line on the
// content pages (SEO-29) both read it, so the date a reader sees is the date
// Google is told, by construction. It is derived from the git commit date of
// the file(s) that back a URL, never hand-maintained, so it cannot drift out
// of sync with what actually changed. If git history isn't available at build
// time (a shallow checkout with no .git), every caller falls back to one
// shared build timestamp so a URL still carries a value rather than a stale
// date.
import { execSync } from 'node:child_process';

const BUILD_TIME = new Date().toISOString();
const gitDateCache = new Map();

export function gitFileLastModifiedIso(file) {
  if (gitDateCache.has(file)) return gitDateCache.get(file);
  let iso = null;
  try {
    const out = execSync(`git log -1 --format=%cI -- "${file}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) iso = new Date(out).toISOString();
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
  return latest ?? BUILD_TIME;
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
