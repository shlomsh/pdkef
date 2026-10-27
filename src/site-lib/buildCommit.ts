// The deploying commit (MEM-19). middleware.ts sends it on every HTML response as a
// `Server-Timing: build;desc="<sha7>"` header, so no page's bytes change per deploy;
// src/lib/errorReport.ts reads it back off the navigation entry. Pure, no environment access.

/** The first 7 characters of a valid VERCEL_GIT_COMMIT_SHA, or '' when there is none. */
export function commitFromEnv(env: Record<string, string | undefined> | undefined): string {
  const sha = env?.VERCEL_GIT_COMMIT_SHA;
  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 7) : '';
}

/** The Server-Timing header value naming the commit, or null when there is no commit. */
export function buildServerTiming(commit: string): string | null {
  return commit ? `build;desc="${commit}"` : null;
}
