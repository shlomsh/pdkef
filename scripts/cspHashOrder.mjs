// MEM-20: Astro's security.csp lists each directive's hash sources in an order
// that varies between builds. Sorting them makes a page's bytes depend only on
// its content. Pure: html in, html out.
//
// MEM-21: Astro also lists the inline styles and scripts of the whole build in
// every page's CSP, so one style edit on one page rewrote all 54 pages (1.49 MB
// on the 2026-10-28 nightly, 1b72a77d to 686e27e0). pruneCspHashes keeps only the
// hashes of the inline content the page itself carries. Nothing injects an
// inline <style> or <script> at run time, and test:csp proves every inline
// element on a page is still covered.
import crypto from 'node:crypto';

const CSP_META = /<meta\b[^>]*\bhttp-equiv=(["'])content-security-policy\1[^>]*>/gi;
const CONTENT_ATTR = /(\bcontent=)(["'])([\s\S]*?)\2/i;
const HASH_SOURCE = /^'sha(?:256|384|512)-[^']*'$/;
const INLINE_STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
// Data blocks are not executable, so script-src does not govern them.
const DATA_BLOCK = /\btype=(["'])application\/(?:ld\+)?json\1/i;

function rewriteCsp(html, rewriteDirective) {
  return html.replace(CSP_META, (tag) =>
    tag.replace(CONTENT_ATTR, (_all, prefix, quote, value) => {
      const rewritten = value.split(';').map((part) => (part.trim() === '' ? part : rewriteDirective(part))).join('; ');
      return `${prefix}${quote}${rewritten}${quote}`;
    }),
  );
}

function sortDirective(directive) {
  const tokens = directive.trim().split(/\s+/).filter(Boolean);
  const rest = tokens.filter((token) => !HASH_SOURCE.test(token));
  const hashes = tokens.filter((token) => HASH_SOURCE.test(token)).sort();
  return [...rest, ...hashes].join(' ');
}

export function sortCspHashes(html) {
  return rewriteCsp(html, sortDirective);
}

const hashSource = (token, texts) => {
  const [algorithm, digest] = token.slice(1, -1).split(/-(.*)/s);
  return texts.some((text) => crypto.createHash(algorithm).update(text).digest('base64') === digest);
};

export function pruneCspHashes(html) {
  const inline = {
    'style-src': [...html.matchAll(INLINE_STYLE)].map((m) => m[1]),
    'script-src': [...html.matchAll(INLINE_SCRIPT)].filter((m) => !/\bsrc=/i.test(m[1]) && !DATA_BLOCK.test(m[1])).map((m) => m[2]),
  };
  return rewriteCsp(html, (directive) => {
    const tokens = directive.trim().split(/\s+/).filter(Boolean);
    const texts = inline[tokens[0]];
    if (!texts) return directive.trim();
    return tokens.filter((token, i) => i === 0 || !HASH_SOURCE.test(token) || hashSource(token, texts)).join(' ');
  });
}
