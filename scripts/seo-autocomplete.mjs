#!/usr/bin/env node
// LOC-11: the one Google surface that answers scripted requests from this
// environment is autocomplete (suggestqueries.google.com). Suggestions are
// ranked by what people in a locale actually type and complete to phrasings
// we never seeded, which is how the 2026-09-12 sweep found the Indonesian
// and Vietnamese size-limit families. SERPs and Trends still come from
// Shlomi's screenshots (content-and-copy.md); this only finds what to ask for.
//
//   node scripts/seo-autocomplete.mjs <hl> <gl> <seed> [<seed> ...]
//   node scripts/seo-autocomplete.mjs id ID "kompres pdf" "memperkecil pdf" --letters
//
// --letters also runs "<seed> a" .. "<seed> z" for every seed (the alphabet
// soup). Output: one suggestion per line, prefixed by how many seeds reached
// it, so a phrasing several seeds converge on sorts to the top.
const args = process.argv.slice(2);
const letters = args.includes('--letters');
const [hl, gl, ...seeds] = args.filter((a) => a !== '--letters');
if (!hl || !gl || seeds.length === 0) {
  console.error('usage: node scripts/seo-autocomplete.mjs <hl> <gl> <seed> [...] [--letters]');
  process.exit(1);
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function suggest(q) {
  const url = new URL('https://suggestqueries.google.com/complete/search');
  url.search = new URLSearchParams({ client: 'firefox', hl, gl, q }).toString();
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`${response.status} for ${q}`);
  return (await response.json())[1];
}

const queries = seeds.flatMap((seed) => (letters ? [seed, ...'abcdefghijklmnopqrstuvwxyz'.split('').map((l) => `${seed} ${l}`)] : [seed]));
const reached = new Map();
for (const q of queries) {
  for (const s of await suggest(q)) reached.set(s, (reached.get(s) ?? 0) + 1);
  await sleep(250);
}
for (const [s, n] of [...reached].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`${n}\t${s}`);
console.error(`${queries.length} seeds, ${reached.size} distinct suggestions (hl=${hl} gl=${gl})`);
