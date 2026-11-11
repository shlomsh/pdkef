// MEM-36: the pinned notes (SEO-57), read once per build instead of once per visit. The build reads the store
// with the read-only token and each page's board renders the notes into its HTML. A build must never fail or
// slow down for want of the store, so every failure is "no notes" and one warning.
import { notesFromResults, notesReadCommands } from './ratingStore.js';
import { regionName } from './regionName.js';
import type { PinnedNote } from './pinnedNote.js';

const TIMEOUT_MS = 5000;

// No @types/node in this repo; the build provides process.env.
declare const process: { env: Record<string, string | undefined> };

const none: readonly PinnedNote[] = [];

/**
 * The notes a board shows: approved ones newest first, then recent votes, spread across the tools.
 * @testSeam
 */
export async function loadNotes(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly PinnedNote[]> {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_READ_ONLY_TOKEN;
  if (!url || !token) {
    console.warn('[notes] no read-only store token: this build shows no pinned notes');
    return none;
  }
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(notesReadCommands()),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`store answered ${res.status}`);
    const results = await res.json();
    if (!Array.isArray(results)) throw new Error('unexpected reply');
    return notesFromResults(results[0], results[1], regionName);
  } catch (error) {
    // expected: no network or a slow store means a build with no notes, never a failed build
    console.warn(`[notes] could not read the store: this build shows no pinned notes (${error instanceof Error ? error.message : error})`);
    return none;
  }
}

let memo: Promise<readonly PinnedNote[]> | undefined;
/**
 * The build's one read, shared by every page.
 * @testSeam
 */
export function notesFromEnv(
  env?: Readonly<Record<string, string | undefined>>,
  fetchImpl?: typeof fetch,
): Promise<readonly PinnedNote[]> {
  memo ??= loadNotes(env, fetchImpl);
  return memo;
}
