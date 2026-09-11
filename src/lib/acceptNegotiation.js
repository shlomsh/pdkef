// Pure Accept-header parsing for middleware.ts's Markdown content
// negotiation (acceptmarkdown.com compliance - see middleware.ts's header
// comment). Kept separate from middleware.ts, which only Vercel's Edge
// Runtime ever loads, so this logic can be unit tested directly like every
// other pure function in src/lib/.

/**
 * The client's preference for `targetType` (e.g. "text/html"), honoring
 * RFC 9110 q-values with exact-type > type/* > * / * precedence at equal q.
 * Returns 0 if the header rules the type out entirely.
 */
export function acceptQuality(acceptHeader, targetType) {
  const [targetMain] = targetType.split('/');
  let exact = null;
  let partial = null;
  let wildcard = null;

  for (const entry of acceptHeader.split(',')) {
    const segments = entry.split(';').map((s) => s.trim());
    const type = segments[0]?.toLowerCase();
    if (!type) continue;

    let q = 1;
    for (const param of segments.slice(1)) {
      const eq = param.indexOf('=');
      if (eq === -1) continue;
      if (param.slice(0, eq).trim() !== 'q') continue;
      const n = Number(param.slice(eq + 1).trim());
      if (Number.isFinite(n)) q = n;
    }

    if (type === targetType) exact = Math.max(exact ?? 0, q);
    else if (type === `${targetMain}/*`) partial = Math.max(partial ?? 0, q);
    else if (type === '*/*') wildcard = Math.max(wildcard ?? 0, q);
  }

  return exact ?? partial ?? wildcard ?? 0;
}

/**
 * The one decision middleware.ts acts on: which representation a page
 * request gets. Returns 'html', 'markdown', or 'unacceptable' (a real 406).
 *
 * The decision lives here rather than inline in middleware.ts because
 * middleware.ts only runs on Vercel's Edge Runtime and is not covered by any
 * unit test, and this exact decision is where the first production bug in
 * this feature lived: acceptQuality() was correct and tested, but the caller
 * compared its two answers with a strict `<`, so a *tie* fell through to
 * Markdown. Ties are common - `Accept: * / *` is curl's own default header
 * (sent with no -H at all), and it matches text/markdown exactly as well as
 * it matches text/html - so every plain curl, and every crawler or bot with
 * an unspecific Accept, was served Markdown instead of the page.
 *
 * Rule: Markdown only when the client prefers it strictly over HTML. A tie,
 * an absent header, or HTML preferred all resolve to HTML, the default every
 * client that did not explicitly ask for something else expects.
 */
export function negotiateRepresentation(acceptHeader) {
  if (!acceptHeader) return 'html';
  const htmlQ = acceptQuality(acceptHeader, 'text/html');
  const markdownQ = acceptQuality(acceptHeader, 'text/markdown');
  if (htmlQ === 0 && markdownQ === 0) return 'unacceptable';
  return markdownQ > htmlQ ? 'markdown' : 'html';
}

/**
 * Where a Markdown-preferring request for `pathname` should go. Returns
 * `{ kind: 'markdown', path }` (fetch that prebuilt .md twin),
 * `{ kind: 'passthrough' }` (let Vercel's own routing answer), or
 * `{ kind: 'not-found' }` (serve /404.md with a real 404).
 *
 * The non-slash branch is the subtle one. A real route's non-slash form
 * (/compress) must pass through so vercel.json's canonical redirect fires
 * and the agent re-requests /compress/ - the middleware never serves
 * Markdown at a non-canonical URL. But a nonexistent non-slash path
 * (/some-path-that-does-not-exist, which is exactly what an agent-readiness
 * scanner probes) has no redirect to fire, so passing it through handed a
 * Markdown-preferring agent the full HTML 404 shell. The two cases are told
 * apart by `redirectSources`, the literal `source` list from vercel.json:
 * scripts/check-trailing-slash-redirects.js fails CI if any real route lacks
 * its non-slash entry there, so a non-slash path that matches no source is,
 * by that invariant, not a page - no probe fetch needed.
 *
 * @param {string} pathname
 * @param {Set<string>} redirectSources
 * @returns {{ kind: 'markdown', path: string } | { kind: 'passthrough' } | { kind: 'not-found' }}
 */
export function markdownRoute(pathname, redirectSources) {
  if (pathname === '/') return { kind: 'markdown', path: '/index.md' };
  if (pathname.endsWith('/')) return { kind: 'markdown', path: `${pathname.slice(0, -1)}.md` };
  if (redirectSources.has(pathname)) return { kind: 'passthrough' };
  return { kind: 'not-found' };
}
