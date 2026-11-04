// The main thread's side of enhance.worker.ts: one worker for one read, or `assess` itself between pages
// where a module worker cannot start (the same fallback as Scan's page worker, SCAN-21).
import { assess, type Assessment } from '#lib/pageEnhance/plan.ts';
import type { GrayImage } from '#lib/pageEnhance/quad.ts';

export interface AssessRequest { id: number; gray: GrayImage }
export type AssessReply = { id: number; ok: true; value: Assessment } | { id: number; ok: false; error: string };

export interface Assessor {
  assess(gray: GrayImage): Promise<Assessment>;
  /** Ends the worker, if there is one. */
  close(): void;
}

/** The worker stopped with a sheet's pixels in it: those pixels went with it, so the caller reads that page again. */
export class WorkerLostError extends Error {}

function startWorker(): Worker | null {
  if (typeof Worker !== 'function') return null;
  try {
    return new Worker(new URL('./enhance.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    // expected: a browser that cannot start a module worker reads the sheets on the main thread
    return null;
  }
}

/** Lets the page paint between two sheets read on the main thread. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function openAssessor(): Assessor {
  let worker = startWorker();
  let waiting: { id: number; resolve(a: Assessment): void; reject(e: unknown): void } | null = null;
  let nextId = 0;

  const retire = () => {
    worker?.terminate();
    worker = null;
    waiting?.reject(new WorkerLostError('The scan check worker stopped'));
    waiting = null;
  };
  if (worker) {
    worker.onmessage = (e: MessageEvent<AssessReply>) => {
      const reply = e.data;
      if (!waiting || waiting.id !== reply.id) return;
      const job = waiting;
      waiting = null;
      if (reply.ok) job.resolve(reply.value);
      else job.reject(new Error(reply.error));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      retire();
    };
  }

  return {
    async assess(gray) {
      if (!worker) {
        await nextTask();
        return assess(gray);
      }
      const id = (nextId += 1);
      const answer = new Promise<Assessment>((resolve, reject) => { waiting = { id, resolve, reject }; });
      worker.postMessage({ id, gray } satisfies AssessRequest, [gray.data.buffer]);
      return answer;
    },
    close() {
      worker?.terminate();
      worker = null;
    },
  };
}
