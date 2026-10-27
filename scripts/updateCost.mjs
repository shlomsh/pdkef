/**
 * What a returning client downloads when its service worker updates (MEM-21).
 *
 * Pure: nothing here touches the file system. Each argument is one build's
 * install set, a Map of public URL -> { hash, bytes } (bytes = brotli q5 size).
 * public/sw.js copies every /_astro/ URL the previous cache already holds, so a
 * hashed URL costs only when it is new; every other URL is revalidated and
 * costs its bytes when they changed (a 304 otherwise); sw.js and the manifest
 * are always fetched.
 */

// Measured 2026-10-27 over ten deploy pairs of main: median 398,025 bytes
// (brotli q5) once MEM-19 and MEM-20 landed, down from a 1.58 MB median before
// (backlog/tasks/MEM-19.md, Done section). A deploy that changes shared chunks
// may exceed it; the summary says how many pages cascaded.
export const UPDATE_COST_TARGET = 500_000;

const ALWAYS = new Set(['/sw.js', '/precache-manifest.json']);

// Same rule as isHashedUrl in public/sw.js.
const isHashed = (url) => url.startsWith('/_astro/');

export function updateCost(before, after) {
  const items = [];
  for (const [url, entry] of after) {
    if (ALWAYS.has(url)) items.push({ url, bytes: entry.bytes, reason: 'always' });
    else if (isHashed(url)) {
      if (!before.has(url)) items.push({ url, bytes: entry.bytes, reason: 'new-hashed' });
    } else if (before.get(url)?.hash !== entry.hash) items.push({ url, bytes: entry.bytes, reason: 'changed' });
  }
  items.sort((a, b) => b.bytes - a.bytes);
  return { total: items.reduce((n, i) => n + i.bytes, 0), items };
}

const fmt = (n) => n.toLocaleString('en-US');
const isPage = (url) => url.endsWith('/') || url.endsWith('.html');

export function summarize({ total, items }, target = UPDATE_COST_TARGET) {
  const chunks = items.filter((i) => i.reason === 'new-hashed').length;
  const pages = items.filter((i) => i.reason === 'changed' && isPage(i.url)).length;
  const verdict = total > target ? 'ABOVE' : 'within';
  const lines = [`Update cost: ${fmt(total)} bytes, ${verdict} target ${fmt(target)} (brotli q5)`];
  lines.push('Top contributors:');
  for (const i of items.slice(0, 10)) lines.push(`  ${fmt(i.bytes).padStart(9)}  ${i.reason.padEnd(10)}  ${i.url}`);
  lines.push(`Cascade: ${pages} ${pages === 1 ? 'page' : 'pages'} changed alongside ${chunks} new hashed ${chunks === 1 ? 'chunk' : 'chunks'}`);
  return lines;
}
