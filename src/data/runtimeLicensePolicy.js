// The reviewed policy behind the trust page's runtime license inventory and
// `npm run test:licenses` (ARCH-22): which packages ship to the browser, and
// which licenses are approved for them. This is product policy - what ships
// and what's allowed - so it lives under src/data, not in a script. The
// script at scripts/runtime-license-inventory.mjs only walks node_modules
// against this policy and renders THIRD_PARTY_LICENSES.md /
// src/data/runtimeLicenseInventory.js from it; it holds no policy of its own.
//
// Dependency-free on purpose: a Node script (scripts/runtime-license-inventory.mjs)
// imports this module directly, without going through a bundler.

// This is a deliberately narrow policy allowlist. Adding an identifier needs
// a human review; a package being open source is not approval by itself.
export const APPROVED_RUNTIME_LICENSES = new Set([
  'MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Zlib', '0BSD', '(MIT AND Zlib)',
]);

// Every production dependency must be reviewed here. Astro and its Preact
// integration are browser runtime packages, but their compiler/dev-server
// dependency trees are build-only and deliberately not traversed below.
// @vercel/functions is the same shape of exception for a different reason:
// it never reaches the browser at all. It backs middleware.ts, which Vercel
// deploys and runs on its own Edge Runtime at request time (see .claude/rules/routing-and-pages.md's
// "Markdown content negotiation" section) - so it belongs in this reviewed
// list (Apache-2.0, approved), but its own dependency tree (OIDC, its CLI
// helpers) is edge/deploy tooling, not "browser-shipped JavaScript" this
// inventory is scoped to.
export const RUNTIME_ROOT_PACKAGES = [
  '@astrojs/preact', '@cantoo/pdf-lib', '@floating-ui/dom', '@floating-ui/react', '@pdf-lib/fontkit',
  '@vercel/analytics', '@vercel/functions', '@vercel/speed-insights', 'astro', 'bidi-js', 'lucide-preact',
  'pdfjs-dist', 'preact', 'regenerator-runtime', 'signature_pad', 'sortablejs',
];

export const BUILD_ONLY_CLOSURES = new Set(['astro', '@astrojs/preact', '@vercel/functions']);

// The complete browser-code closure of the roots above. New transitive code
// must be added explicitly after review, rather than inheriting approval from
// its parent package. The two signal packages are emitted by Astro's client.
export const RUNTIME_PACKAGE_NAMES = [
  ...RUNTIME_ROOT_PACKAGES,
  '@preact/signals', '@preact/signals-core', '@pdf-lib/standard-fonts', '@pdf-lib/upng',
  '@floating-ui/core', '@floating-ui/react-dom', '@floating-ui/utils', 'color', 'color-convert',
  'color-name', 'color-string', 'html-entities', 'is-arrayish',
  'node-html-better-parser', 'pako', 'require-from-string', 'simple-swizzle', 'tabbable', 'tslib',
].sort((a, b) => a.localeCompare(b));

export const LICENSE_URL_OVERRIDES = {
  // The published tarball declares MIT but does not carry a license file.
  '@pdf-lib/fontkit': 'https://github.com/Hopding/fontkit/blob/master/LICENSE',
};
