import { useRef } from 'preact/hooks';

// "Is this async result still wanted?" - the one answer four tools were
// missing (DEBT-18) and two already owned in their own shapes.
//
// Sign (PdfSignTool.tsx's runExport) captures a request id, the document
// revision and the source File before its export await and commits nothing if
// any of the three moved. Compress (PdfCompressTool.tsx's runTokenRef) needs
// only the first of those, because `resetOutput` is the single place every
// invalidating change already goes through. This is those two, generalized:
// a token every caller gets for free, plus an optional list of values the
// caller wants compared by identity when the token alone cannot see the
// change.
//
// Use it wherever a handler awaits and then writes state: capture a ticket
// before the first `await`, and check `isCurrent()` after every one of them,
// including inside a per-item loop.
//
//   const run = useLatestRun(() => [file, documentRevisionRef.current]);
//   ...
//   const ticket = run.begin();
//   const blob = await makeIt(file);
//   if (!ticket.isCurrent()) return;
//   ticket.settle();
//
// `begin()` supersedes any run already in flight, so a second export or a
// second load needs no explicit invalidation. `invalidate()` is for everything
// else that makes a running result stale (a new file, a changed option, an
// undo), and it reports whether it actually dropped a live run so the caller
// can put its own "preparing" UI back - the one thing a bare token ref cannot
// tell you.

const NO_KEYS: readonly unknown[] = [];

export interface RunTicket {
  /** False once this run has been superseded, invalidated, or had a key move. */
  isCurrent(): boolean;
  /**
   * This run is finished and has committed. A later `invalidate()` no longer
   * reports it as live, so nothing tries to recover UI it already left tidy.
   */
  settle(): void;
}

export interface LatestRun {
  /** Capture what this run depends on. Call before the first `await`. */
  begin(): RunTicket;
  /**
   * Drop every run in flight. Returns true if one was actually live (begun and
   * not yet settled), which is the caller's cue to reset any in-progress UI.
   */
  invalidate(): boolean;
}

/**
 * @param readKeys optional: values, read fresh at call time, whose identity a
 *   run depends on. Omit it for the cheap case, where `begin()`/`invalidate()`
 *   already see every change (Compress's shape); pass it when state can move
 *   without going through either (Sign's document revision and source file).
 */
export function useLatestRun(readKeys?: () => readonly unknown[]): LatestRun {
  const tokenRef = useRef(0);
  const liveRef = useRef<number | null>(null);
  // Re-read on every render so `isCurrent()` compares against what the tool
  // holds now, not against the render that started the run.
  const readKeysRef = useRef(readKeys);
  readKeysRef.current = readKeys;
  const apiRef = useRef<LatestRun | null>(null);

  if (apiRef.current === null) {
    const readNow = (): readonly unknown[] => readKeysRef.current?.() ?? NO_KEYS;
    apiRef.current = {
      begin() {
        const token = (tokenRef.current += 1);
        liveRef.current = token;
        const captured = readNow();
        return {
          isCurrent() {
            if (tokenRef.current !== token) return false;
            const now = readNow();
            return now.length === captured.length
              && captured.every((value, index) => Object.is(value, now[index]));
          },
          settle() {
            if (liveRef.current === token) liveRef.current = null;
          },
        };
      },
      invalidate() {
        tokenRef.current += 1;
        const wasLive = liveRef.current !== null;
        liveRef.current = null;
        return wasLive;
      },
    };
  }

  return apiRef.current;
}
