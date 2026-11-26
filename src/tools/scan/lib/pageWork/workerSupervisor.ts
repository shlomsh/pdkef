// What the main thread decides about the page worker (SCAN-21), as data in and data out: whether to start one at
// all, and what each thing that happens to it (its probe answering, failing or timing out, a crash) means for the
// pages. offThread.ts gathers the browser's facts and signals, and acts on the answer.

/** How long a new worker may take to load and answer its probe before the pages go to the main thread. */
export const PROBE_MS = 15_000;

interface Capabilities { worker: boolean; offscreenCanvas: boolean }

/** A worker is started only where the browser has both a Worker and OffscreenCanvas. */
export const canStartWorker = ({ worker, offscreenCanvas }: Capabilities): boolean => worker && offscreenCanvas;

export type Phase = 'probing' | 'ready' | 'retired';

export type Signal =
  | { kind: 'probe-answered'; ok: boolean }
  | { kind: 'probe-failed' }
  | { kind: 'probe-timeout' }
  | { kind: 'crashed' };

/** The phase after `signal`; `retire` is true when this signal ends the worker, whose waiting jobs then go back to
 * the main thread. A retired worker stays retired and is retired once. */
export function supervise(phase: Phase, signal: Signal): { phase: Phase; retire: boolean } {
  if (phase === 'retired') return { phase, retire: false };
  if (signal.kind === 'crashed') return { phase: 'retired', retire: true };
  if (phase === 'ready') return { phase, retire: false };
  if (signal.kind === 'probe-answered' && signal.ok) return { phase: 'ready', retire: false };
  return { phase: 'retired', retire: true };
}
