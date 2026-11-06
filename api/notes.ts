// Vercel Function: the approved pinned notes (SEO-57), read from Upstash Redis at most once an hour.
// A note exists only after Shlomi approved a comment a person agreed to show (scripts/ratings-approve.mjs).
// Three layers keep the store quiet: the browser cache, the CDN, and a memo in this warm instance, which
// holds whatever the CDN does. Never throws: a missing or failing store gives an empty list for a short while.
import { readEnv, type Command } from '../src/site-lib/errorReportStore.js';
import { notesFromResult, notesReadCommands } from '../src/site-lib/ratingStore.js';
import { NOTES_CACHE_SECONDS, NOTES_FAILURE_CACHE_SECONDS, type PinnedNote } from '../src/site-lib/pinnedNote.js';

// No @types/node in this repo; the function runtime provides process.env.
declare const process: { env: Record<string, string | undefined> };

async function pipeline(
  store: { url: string; token: string },
  commands: Command[],
): Promise<{ result?: unknown }[]> {
  const res = await fetch(`${store.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${store.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error('store');
  return (await res.json()) as { result?: unknown }[];
}

interface Memo {
  readonly expires: number;
  readonly notes: readonly PinnedNote[];
  readonly ok: boolean;
}
let memo: Memo | null = null;
// The last good answer, kept to serve through a later failure.
let lastGood: readonly PinnedNote[] | null = null;

/** @testSeam */
export function resetNotesCacheForTests(): void {
  memo = null;
  lastGood = null;
  pending = null;
}

function respond(m: Memo): Response {
  // The seconds left on the memo, so no copy outlives it; no stale-while-revalidate, so a removed note leaves within the hour.
  const seconds = Math.max(1, Math.ceil((m.expires - Date.now()) / 1000));
  const control = `public, max-age=${seconds}`;
  return new Response(JSON.stringify({ notes: m.notes }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': control,
      'Vercel-CDN-Cache-Control': control,
    },
  });
}

async function read(): Promise<Memo> {
  const now = Date.now();
  try {
    const store = readEnv(process.env);
    if (!store) throw new Error('no store');
    const [reply] = await pipeline(store, notesReadCommands());
    lastGood = notesFromResult(reply);
    return { expires: now + NOTES_CACHE_SECONDS * 1000, notes: lastGood, ok: true };
  } catch {
    // expected: a store outage serves the last good list, or none, for a short while
    return { expires: now + NOTES_FAILURE_CACHE_SECONDS * 1000, notes: lastGood ?? [], ok: false };
  }
}

// Requests arriving together on a cold or expired memo share one store read.
let pending: Promise<Memo> | null = null;

export async function GET(): Promise<Response> {
  if (!memo || memo.expires <= Date.now()) {
    pending ??= read().finally(() => {
      pending = null;
    });
    memo = await pending;
  }
  return respond(memo);
}
