// Vercel Routing Middleware: Accept-header content negotiation between the
// prerendered HTML pages and their prerendered Markdown twins (see
// src/pages/[slug].md.ts, index.md.ts, 404.md.ts). This is the first thing
// in this codebase that runs at request time rather than at build time - see
// CLAUDE.md's "Markdown content negotiation" section for why that line had
// to be crossed and what it does and doesn't change about the "no PDF
// processing server" privacy invariant (nothing: this never sees a PDF byte,
// it only ever looks at marketing/doc page requests).
//
// Astro's own output is fully static (output: 'static', no adapter), so
// there is no Astro-level middleware to conflict with here - this is a
// platform-level Vercel primitive, unrelated to (and unaffected by) Astro's
// SSR-only middleware system.
//
// Compliance target: acceptmarkdown.com. Its four checks, and where each is
// handled below: (1) Accept: text/markdown gets text/markdown back - the
// fetch(markdownPath) branch; (2) Vary: Accept is set on every negotiated
// response, including the plain-HTML ones, so a CDN never serves the wrong
// cached variant to the next request; (3) an Accept header that names
// neither representation gets a real 406, not a silent fallback - the first
// early return below; (4) q-values are honored via acceptQuality's
// exact > type/* > */* precedence, so an ordinary browser's
// `text/html,...,*/*;q=0.8` still gets HTML even though */* technically
// matches text/markdown too.
import { next } from '@vercel/functions';
import { acceptQuality } from './src/lib/acceptNegotiation.js';

export const config = {
  // Keep this broad and do the real filtering (extension check) in code
  // instead of a denser regex here - matcher errors are silent, so simple
  // and readable wins. The excluded directories are pure asset trees that
  // can never be negotiable pages; everything else still gets the
  // extension check on the next line before any negotiation logic runs.
  matcher: ['/((?!_astro/|images/|icons/|fonts/).*)'],
};

const VARY_VALUE = 'Accept, Accept-Encoding';
const HAS_EXTENSION = /\.[a-zA-Z0-9]+$/;

export default async function middleware(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();

  const url = new URL(request.url);
  const { pathname } = url;

  // Assets, sitemap.xml, robots.txt, llms.txt, manifest.webmanifest, and the
  // .md files themselves all carry a real extension and are never
  // negotiated - each has exactly one representation. This also stops the
  // fetch() calls below (to /<slug>.md and /404.md) from re-entering this
  // same negotiation logic.
  if (HAS_EXTENSION.test(pathname)) return next();

  const accept = request.headers.get('accept');
  const htmlQ = accept ? acceptQuality(accept, 'text/html') : 1;
  const markdownQ = accept ? acceptQuality(accept, 'text/markdown') : 0;

  if (accept && htmlQ === 0 && markdownQ === 0) {
    return new Response('Not Acceptable: this page is available as text/html or text/markdown.', {
      status: 406,
      headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8', Vary: VARY_VALUE }),
    });
  }

  if (markdownQ === 0 || markdownQ < htmlQ) {
    return next({ headers: new Headers({ Vary: VARY_VALUE }) });
  }

  // Markdown preferred from here on. Only negotiate at the canonical
  // (trailing-slash) URL - a non-slash real route still needs vercel.json's
  // own redirect to fire first (see CLAUDE.md's URL canonicalization
  // section), and a well-behaved agent re-requests the canonical URL it was
  // redirected to with the same Accept header.
  if (pathname !== '/' && !pathname.endsWith('/')) {
    return next();
  }

  const markdownPath = pathname === '/' ? '/index.md' : `${pathname.slice(0, -1)}.md`;
  const markdownResponse = await fetch(new URL(markdownPath, request.url));
  if (markdownResponse.ok) {
    return new Response(markdownResponse.body, {
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/markdown; charset=utf-8', Vary: VARY_VALUE }),
    });
  }

  // No Markdown twin for this path - either it's a genuinely nonexistent
  // path (the common case: see HTTP-404-01 in CLAUDE.md) or a real page
  // that doesn't have one yet (e.g. /licenses/). Either way, a real 404 with
  // a Markdown body pointing at the sitemap and llms.txt beats a 200.
  const notFoundResponse = await fetch(new URL('/404.md', request.url));
  return new Response(notFoundResponse.body, {
    status: 404,
    headers: new Headers({ 'Content-Type': 'text/markdown; charset=utf-8', Vary: VARY_VALUE }),
  });
}
