// The deploying commit, stamped into built HTML only. BaseLayout.astro emits
// `<meta name="pdkef-build" content="__BUILD_COMMIT__">` in production; the
// precache script substitutes it AFTER the build id is hashed (like
// __BUILD_ID__ on /about/), so no JS chunk and no content hash depends on the
// commit and a docs-only push keeps the same build id and service worker cache.

const PLACEHOLDER = '__BUILD_COMMIT__';
// Optional leading indent and trailing newline go with the tag when it is removed.
const TAG = /([ \t]*)<meta name="pdkef-build" content="__BUILD_COMMIT__"\s*\/?>(\r?\n)?/;

export function commitFromEnv(env) {
  const sha = env?.VERCEL_GIT_COMMIT_SHA;
  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 7) : '';
}

export function hasPlaceholder(html) {
  return TAG.test(html);
}

export function stampBuildCommit(html, commit) {
  if (!hasPlaceholder(html)) return html;
  if (!commit) return html.replace(TAG, '');
  return html.replace(TAG, (_all, indent, nl) => `${indent}<meta name="pdkef-build" content="${commit}">${nl ?? ''}`);
}

export { PLACEHOLDER };
