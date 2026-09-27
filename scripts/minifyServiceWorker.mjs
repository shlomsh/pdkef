import { transformSync } from 'esbuild';

// Vercel compresses static assets but never minifies them, and public/sw.js is
// copied into dist/ verbatim. Minifying it here keeps the shipped bytes small
// while public/sw.js itself stays readable, comments and all, for anyone
// editing it. No `format` and no `target`: sw.js runs as a classic worker
// script, so its top-level names must not be renamed or wrapped, and its
// syntax must not be lowered.
export function minifyServiceWorker(source) {
  return transformSync(source, { minify: true, legalComments: 'none', loader: 'js' }).code;
}
