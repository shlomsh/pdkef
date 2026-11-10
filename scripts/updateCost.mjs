/**
 * What a returning client downloads when its service worker updates (MEM-21).
 *
 * Pure: nothing here touches the file system. Each argument is one build's
 * install set, a Map of public URL -> { hash, bytes } (bytes = brotli q5 size).
 * public/sw.js copies every /_astro/ URL the previous cache already holds, so a
 * hashed URL costs only when it is new; every other URL costs its bytes when
 * they changed and is copied with no request otherwise, once its old bytes
 * match the manifest hash (MEM-32); sw.js and the manifest are always fetched.
 *
 * The figure is a ceiling: a hashed URL is charged as new when the previous
 * install set lacks it, but the real previous cache may also hold hashed files
 * cached on demand, which the service worker would copy for free.
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

const glyph = (str) => str.replace(/\r?\n/g, '⏎');

// The first place two strings differ, with `context` chars either side in each.
export function firstDifference(before, after, context = 60) {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let index = 0;
  while (index < max && before[index] === after[index]) index++;
  const clip = (str) => glyph(str.slice(Math.max(0, index - context), index + context + 1));
  return { index, before: clip(before), after: clip(after) };
}

// pairs: [{ url, before, after }] for changed pages. Groups pages whose first
// difference reads the same, largest group first.
export function explainChanged(pairs) {
  const groups = new Map();
  for (const { url, before, after } of pairs) {
    const d = firstDifference(before, after);
    if (!d) continue;
    const key = `${d.before}\u0000${d.after}`;
    const g = groups.get(key) ?? { count: 0, urls: [], sample: { before: d.before, after: d.after } };
    g.count++;
    g.urls.push(url);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export function summarize({ total, items }, target = UPDATE_COST_TARGET, explanation) {
  const chunks = items.filter((i) => i.reason === 'new-hashed');
  const pages = items.filter((i) => i.reason === 'changed' && isPage(i.url)).length;
  const verdict = total > target ? 'ABOVE' : 'within';
  const lines = [`Update cost: ${fmt(total)} bytes, ${verdict} target ${fmt(target)} (brotli q5)`];
  lines.push('Top contributors:');
  for (const i of items.slice(0, 10)) lines.push(`  ${fmt(i.bytes).padStart(9)}  ${i.reason.padEnd(10)}  ${i.url}`);
  lines.push(`Cascade: ${pages} ${pages === 1 ? 'page' : 'pages'} changed alongside ${chunks.length} new hashed ${chunks.length === 1 ? 'chunk' : 'chunks'}`);
  if (chunks.length > 0) {
    lines.push('New chunks:');
    for (const i of chunks.slice(0, 10)) lines.push(`  ${i.url}`);
    if (chunks.length > 10) lines.push(`  ...and ${chunks.length - 10} more`);
  }
  if (explanation?.length) {
    lines.push('What changed in pages:');
    for (const g of explanation.slice(0, 3)) {
      lines.push(`  ${g.count} ${g.count === 1 ? 'page' : 'pages'}: before «${g.sample.before}» after «${g.sample.after}»`);
      lines.push(`    e.g. ${g.urls.slice(0, 3).join(' ')}`);
    }
  }
  return lines;
}
