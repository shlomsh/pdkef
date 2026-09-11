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
