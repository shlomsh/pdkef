#!/usr/bin/env node
// Reports, per indexable URL, when its content last changed against when Google last
// crawled it - the instrument SEO-01's addendum asked for.
//
// Why this exists. SEO-04 found Google serving /redact/ with a title and meta from
// before 2026-08-29 while the live URL served the current ones, so a shipped copy
// change was invisible in the SERP and the CTR reading planned to judge it would have
// measured nothing. Search Console's Coverage report cannot show that: it says a URL is
// "Indexed", never that it is *current*. The one column that would have caught it is
// `Last crawled` in URL Inspection, and on its own even that is not enough - a crawl
// date only means something next to "when did this page's content last change", which
// Search Console has no idea about and git knows exactly.
//
// So this script owns the half that can be automated (content last changed, from git,
// per page rather than per repo) and leaves one manual input: the `Last crawled` dates,
// which have no API here and are read off URL Inspection by hand. Fill them into
// docs/seo-last-crawled.json and re-run; the verdict column does the comparison.
//
// Deliberately NOT a CI guard, and must not become one. It reaches the network with
// --fetch and its interesting half is hand-entered, so wiring it into ci.yml would buy
// a flaky check that fails for reasons no commit caused. It is a report you run at the
// monthly SEO-02 refresh.
//
//   node scripts/seo-crawl-staleness.mjs            # git dates + recorded crawl dates
//   node scripts/seo-crawl-staleness.mjs --fetch    # also fetch live <title> to confirm
//                                                   # what we currently serve
//   node scripts/seo-crawl-staleness.mjs --markdown # emit a paste-ready table

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://pdkef.com';
const CRAWL_DATA = resolve(root, 'docs/seo-last-crawled.json');

const args = new Set(process.argv.slice(2));
const wantFetch = args.has('--fetch');
const wantMarkdown = args.has('--markdown');

function git(cmdArgs) {
  return execFileSync('git', cmdArgs, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

// A changed line only matters here if a crawler could see it. Comment-only edits are
// the common false positive and they are not hypothetical: 203b204 ("Fix duplicate
// recent files on mobile") rewrote one comment inside the sign tool's block, which
// naively dated /sign/'s content to that day and would have reported the page as stale
// against any earlier crawl. Whitespace-only changes are skipped for the same reason.
const COMMENT_PREFIXES = {
  '.js': ['//', '/*', '*'],
  '.mjs': ['//', '/*', '*'],
  '.ts': ['//', '/*', '*'],
  '.astro': ['//', '/*', '*', '<!--'],
  '.yaml': ['#'],
  '.yml': ['#'],
};

function isVisibleChange(changedLines, relPath) {
  const ext = relPath.slice(relPath.lastIndexOf('.'));
  const prefixes = COMMENT_PREFIXES[ext] ?? [];
  return changedLines.some((raw) => {
    const line = raw.trim();
    if (!line) return false;
    return !prefixes.some((p) => line.startsWith(p));
  });
}

// Walk a `git log -p` stream and return the newest commit whose changes to this path
// are visible ones. Both callers share it so the file and line-range paths cannot drift
// apart on what counts as a change.
const HEADER = /^(\d{4}-\d\d-\d\dT[^|]*)\|([0-9a-f]+)\|(.*)$/;

function newestVisible(out, relPath) {
  const commits = [];
  let current = null;
  for (const line of out.split('\n')) {
    const header = line.match(HEADER);
    if (header) {
      current = { date: header[1], sha: header[2], subject: header[3], changed: [] };
      commits.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+') || line.startsWith('-')) current.changed.push(line.slice(1));
  }
  const visible = commits.find((c) => isVisibleChange(c.changed, relPath));
  const chosen = visible ?? commits[0];
  if (!chosen) return null;
  return { ...chosen, commentOnlySkipped: visible ? commits.indexOf(visible) : 0 };
}

// Last visible change to a whole file.
function lastChangedFile(relPath) {
  const out = git(['log', '-40', '--format=%cI|%h|%s', '-p', '--', relPath]);
  return newestVisible(out, relPath);
}

// Last visible change to one line range, followed through history. This is the reason a
// tool page's date is meaningful at all: every tool lives in one shared tools.js, so a
// whole-file date would report the most recent edit to *any* tool and mark all ten
// pages as changed together.
function lastChangedRange(relPath, start, end) {
  const out = git(['log', '-L', `${start},${end}:${relPath}`, '--format=%cI|%h|%s', '-40']);
  return newestVisible(out, relPath);
}

// Find each top-level object in a registry array file and the line range it spans, so a
// per-entry history is possible. Relies on the file's consistent 2-space formatting and
// throws rather than guessing if that ever stops holding.
function objectRanges(relPath, keyName) {
  const lines = readFileSync(resolve(root, relPath), 'utf8').split('\n');
  const ranges = [];
  let open = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] === '  {') open = i;
    else if (lines[i] === '  },' && open !== null) {
      const block = lines.slice(open, i + 1);
      const hit = block.map((l) => l.match(new RegExp(`^\\s*${keyName}: '([^']+)'`))).find(Boolean);
      if (hit) ranges.push({ key: hit[1], start: open + 1, end: i + 1 });
      open = null;
    }
  }
  if (ranges.length === 0) {
    throw new Error(`No ${keyName} entries found in ${relPath}. Has its formatting changed?`);
  }
  return ranges;
}

// Build the URL inventory from the repo, not from the live sitemap, so this runs offline
// and describes the code in front of you rather than the last deploy.
function inventory() {
  const rows = [];

  rows.push({
    url: '/',
    kind: 'home',
    source: 'src/pages/index.astro',
    changed: lastChangedFile('src/pages/index.astro'),
  });

  for (const { key, start, end } of objectRanges('src/data/tools.js', 'href')) {
    rows.push({
      url: key,
      kind: 'tool',
      source: `src/data/tools.js:${start}-${end}`,
      changed: lastChangedRange('src/data/tools.js', start, end),
    });
  }

  for (const { key } of objectRanges('src/data/contentPages.js', 'href')) {
    const slug = key.replace(/^\/|\/$/g, '');
    const yaml = `src/content/content-pages/${slug}.yaml`;
    if (!existsSync(resolve(root, yaml))) {
      throw new Error(`Registry lists ${key} but ${yaml} does not exist.`);
    }
    rows.push({ url: key, kind: 'content', source: yaml, changed: lastChangedFile(yaml) });
  }

  rows.push({
    url: '/licenses/',
    kind: 'other',
    source: 'src/pages/licenses.astro',
    changed: lastChangedFile('src/pages/licenses.astro'),
    note: 'not in sitemap',
  });

  return rows;
}

async function fetchTitle(url) {
  try {
    const res = await fetch(`${SITE}${url}`, { redirect: 'follow' });
    if (!res.ok) return `HTTP ${res.status}`;
    const html = await res.text();
    const m = html.match(/<title>([^<]*)<\/title>/i);
    return m ? m[1].replace(/&amp;/g, '&').trim() : '(no title)';
  } catch (err) {
    return `fetch failed: ${err.message}`;
  }
}

const day = (iso) => (iso ? iso.slice(0, 10) : '');

function verdict(changedIso, crawled) {
  if (!crawled) return { label: 'NO DATA', stale: false, unknown: true };
  // Compare dates only. Last crawled has day granularity in URL Inspection, so a
  // same-day result cannot be ordered and is not evidence of staleness either way.
  const c = day(changedIso);
  if (crawled < c) return { label: 'STALE', stale: true, unknown: false };
  if (crawled === c) return { label: 'same day', stale: false, unknown: false };
  return { label: 'current', stale: false, unknown: false };
}

async function main() {
  const rows = inventory();

  let crawled = {};
  if (existsSync(CRAWL_DATA)) {
    const parsed = JSON.parse(readFileSync(CRAWL_DATA, 'utf8'));
    crawled = parsed.lastCrawled ?? {};
    if (parsed.captured) console.log(`Last crawled dates captured ${parsed.captured}\n`);
  } else {
    console.log(`No ${CRAWL_DATA.replace(`${root}/`, '')} yet - reporting content dates only.`);
    console.log('Fill that file from URL Inspection to get staleness verdicts.\n');
  }

  for (const row of rows) {
    row.crawled = crawled[row.url] ?? null;
    row.verdict = verdict(row.changed?.date, row.crawled);
    if (wantFetch) row.liveTitle = await fetchTitle(row.url);
  }

  // Most urgent first: proven stale, then unknown, then current; oldest crawl first.
  rows.sort((a, b) => {
    const rank = (r) => (r.verdict.stale ? 0 : r.verdict.unknown ? 1 : 2);
    return rank(a) - rank(b) || (a.crawled ?? '').localeCompare(b.crawled ?? '');
  });

  if (wantMarkdown) {
    console.log('| URL | Content changed | Last crawled | Verdict |');
    console.log('| --- | --- | --- | --- |');
    for (const r of rows) {
      console.log(
        `| \`${r.url}\` | ${day(r.changed?.date)} | ${r.crawled ?? '-'} | ${r.verdict.label} |`,
      );
    }
  } else {
    const pad = Math.max(...rows.map((r) => r.url.length));
    for (const r of rows) {
      const flag = r.verdict.stale ? '!' : ' ';
      let line = `${flag} ${r.url.padEnd(pad)}  changed ${day(r.changed?.date)}`;
      line += `  crawled ${(r.crawled ?? '-').padEnd(10)}  ${r.verdict.label}`;
      console.log(line);
      if (r.changed) {
        const skipped = r.changed.commentOnlySkipped
          ? `  (skipped ${r.changed.commentOnlySkipped} comment-only)`
          : '';
        console.log(`  ${''.padEnd(pad)}  ${r.changed.sha} ${r.changed.subject}${skipped}`);
      }
      if (wantFetch) console.log(`  ${''.padEnd(pad)}  live <title>: ${r.liveTitle}`);
    }
  }

  const stale = rows.filter((r) => r.verdict.stale);
  const unknown = rows.filter((r) => r.verdict.unknown);
  console.log(`\n${rows.length} URLs. ${stale.length} proven stale, ${unknown.length} with no crawl date.`);
  if (stale.length) {
    console.log('Stale means Google last crawled the URL before its content last changed,');
    console.log('so what ranks is not what we serve. Request indexing for these:');
    for (const r of stale) console.log(`  ${SITE}${r.url}`);
  }
  if (unknown.length && !existsSync(CRAWL_DATA)) {
    console.log('\nTo record crawl dates: URL Inspection in Search Console, one URL at a time,');
    console.log(`read "Last crawled", and write them into ${CRAWL_DATA.replace(`${root}/`, '')}.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
