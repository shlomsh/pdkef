// Shared by check-reveal-observers and check-fetch-sites (ARCH-84). Scans whole file text for a
// pattern (so a call split across lines is seen) and pairs every site with exactly one allowlist
// entry ({ file, includes, reason }). A site with no free entry is "unlisted"; an entry no site
// used is "stale". So a second call in an allowlisted file fails, and so does a removed one.
const isComment = (t) => /^\s*(\/\/|\*|\/\*)/.test(t);

export function sitesIn(text, pattern) {
  const re = new RegExp(pattern.source, 'g');
  const sites = [];
  for (const m of text.matchAll(re)) {
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    const lineEnd = text.indexOf('\n', m.index);
    const endOfMatchLine = text.indexOf('\n', m.index + m[0].length);
    const firstLine = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (isComment(firstLine)) continue;
    sites.push({
      line: text.slice(0, m.index).split('\n').length,
      text: text.slice(lineStart, endOfMatchLine === -1 ? undefined : endOfMatchLine).trim(),
    });
  }
  return sites;
}

// files: [{ file, text }]; allow: entries. Returns [{ file, line, text, kind: 'unlisted' | 'stale' }].
export function pairSites({ files, allow, pattern }) {
  const used = new Set();
  const hits = [];
  for (const { file, text } of files) {
    for (const s of sitesIn(text, pattern)) {
      const i = allow.findIndex((a, k) => !used.has(k) && file.endsWith(a.file) && s.text.includes(a.includes));
      if (i === -1) hits.push({ file, ...s, kind: 'unlisted' });
      else used.add(i);
    }
  }
  allow.forEach((a, k) => {
    if (!used.has(k)) hits.push({ file: a.file, line: 0, text: a.includes, kind: 'stale' });
  });
  return hits;
}
