// The main thread's side of the page worker (SCAN-21): started on the first page, kept for the rest of
// the visit, and given up on, for good, where it cannot do the work as the main thread would. A job the
// worker cannot take comes back as NO_WORKER, and the caller runs it on the main thread instead.
import type { PageJob, PageJobResult, PageReply } from './protocol.ts';

/** How long a new worker may take to load and answer its probe before the pages go to the main thread. */
const PROBE_MS = 15_000;

export const NO_WORKER = Symbol('no page worker');

interface Waiting { resolve(value: unknown): void; reject(error: unknown): void }

let ready: Promise<Worker | null> | null = null;
let nextId = 0;
const waiting = new Map<number, Waiting>();

function send(worker: Worker, job: PageJob): Promise<unknown> {
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, job });
  });
}

/** No more worker: every job still waiting on it is handed back, to run on the main thread. */
function retire(worker: Worker): null {
  worker.terminate();
  ready = Promise.resolve(null);
  const gone = new Error('The page worker stopped');
  for (const job of waiting.values()) job.reject(gone);
  waiting.clear();
  return null;
}

function start(): Promise<Worker | null> {
  if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') return Promise.resolve(null);
  let worker: Worker;
  try {
    worker = new Worker(new URL('./page.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    // expected: a browser that cannot start a module worker processes pages on the main thread
    return Promise.resolve(null);
  }
  worker.onmessage = (e: MessageEvent<PageReply>) => {
    const reply = e.data;
    const job = waiting.get(reply.id);
    if (!job) return;
    waiting.delete(reply.id);
    if (reply.ok) job.resolve(reply.value);
    else job.reject(reply.error);
  };
  // A worker that never loaded (an old browser, a chunk lost offline) or that died: its jobs, and every
  // later one, run on the main thread. The jobs' callers report an error the main thread does not share.
  worker.onerror = (event) => {
    event.preventDefault();
    retire(worker);
  };
  return new Promise<Worker | null>((resolve) => {
    const timer = setTimeout(() => resolve(retire(worker)), PROBE_MS);
    send(worker, { kind: 'probe' }).then((ok) => resolve(ok ? worker : retire(worker)), () => {
      // expected: a probe that cannot even answer means no worker, the same as one that answers no
      resolve(retire(worker));
    }).finally(() => clearTimeout(timer));
  });
}

/** The job's result from the page worker; NO_WORKER where there is none. Rejects with the worker's error
 * when the job failed there: the caller then runs it on the main thread. */
export async function offThread<J extends PageJob>(job: J): Promise<PageJobResult<J> | typeof NO_WORKER> {
  const worker = await (ready ??= start());
  if (!worker) return NO_WORKER;
  return (await send(worker, job)) as PageJobResult<J>;
}

/** @testSeam Forget the worker, so a test starts the next one afresh. */
export function resetPageWorker() {
  ready = null;
  waiting.clear();
}
