// MEM-20: Astro's security.csp lists each directive's hash sources in an order
// that varies between builds. Sorting them makes a page's bytes depend only on
// its content. Pure: html in, html out.

const CSP_META = /<meta\b[^>]*\bhttp-equiv=(["'])content-security-policy\1[^>]*>/gi;
const CONTENT_ATTR = /(\bcontent=)(["'])([\s\S]*?)\2/i;
const HASH_SOURCE = /^'sha(?:256|384|512)-[^']*'$/;

function sortDirective(directive) {
  const tokens = directive.trim().split(/\s+/).filter(Boolean);
  const rest = tokens.filter((token) => !HASH_SOURCE.test(token));
  const hashes = tokens.filter((token) => HASH_SOURCE.test(token)).sort();
  return [...rest, ...hashes].join(' ');
}

export function sortCspHashes(html) {
  return html.replace(CSP_META, (tag) =>
    tag.replace(CONTENT_ATTR, (_all, prefix, quote, value) => {
      const sorted = value.split(';').map((part) => (part.trim() === '' ? part : sortDirective(part))).join('; ');
      return `${prefix}${quote}${sorted}${quote}`;
    }),
  );
}
