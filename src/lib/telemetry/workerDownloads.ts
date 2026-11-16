/**
 * MEM-45: asks the offline-copy worker what it sent to the server since the last report. The worker
 * counts per kind of request and hands the counts to one page only (taking deletes them); this page
 * turns them into buckets for `worker_downloads`. Never throws.
 */

import { DOWNLOAD_BUCKETS, DOWNLOAD_KINDS, type DownloadBucket, type DownloadKind } from './usageEventSchema';

type DownloadProps = Partial<Record<DownloadKind, DownloadBucket>> & { unmeasured?: true };

const BOUNDS = [1, 2, 6, 11, 21, 41, 81];

/**
 * A worker's reply as the buckets that travel: only positive whole counts, and `unmeasured` as sent.
 * Undefined when there is nothing to send.
 * @testSeam
 */
export function downloadProps(reply: unknown): DownloadProps | undefined {
  const r = (reply ?? {}) as Record<string, unknown>;
  const props: DownloadProps = {};
  for (const kind of DOWNLOAD_KINDS) {
    const n = r[kind];
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) props[kind] = DOWNLOAD_BUCKETS[BOUNDS.filter((b) => n >= b).length - 1];
  }
  if (r.unmeasured === true) props.unmeasured = true;
  return Object.keys(props).length ? props : undefined;
}

const HINT_WAIT_MS = 5000;
const REPLY_WAIT_MS = 15000;

/** One take from `worker`: its reply, or undefined when it gives none in time. */
function take(worker: { postMessage(m: unknown, t: Transferable[]): void }): Promise<unknown> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    const finish = (value?: unknown) => {
      clearTimeout(timer);
      port1.close();
      resolve(value);
    };
    const timer = setTimeout(finish, REPLY_WAIT_MS);
    port1.onmessage = (e) => finish(e.data);
    try {
      worker.postMessage({ type: 'pdkef:take-downloads' }, [port2]);
    } catch {
      // expected: a worker that went away gives no reply
      finish();
    }
  });
}

/**
 * Calls `onReport` once at most per page load, with the buckets for what the worker counted: right
 * away when a worker controls the page, and 5 s after the worker's last `pdkef:downloads-recorded` hint.
 * A take with nothing in it keeps the page listening.
 */
export function watchWorkerDownloads(onReport: (props: DownloadProps) => void): void {
  try {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    let done = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async (worker: ServiceWorker | MessagePort | null | undefined) => {
      if (done || busy || !worker) return;
      busy = true;
      const props = downloadProps(await take(worker as ServiceWorker));
      busy = false;
      if (props && !done) {
        done = true;
        onReport(props);
      }
    };
    void run(sw.controller); // reason: take catches everything itself
    sw.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type !== 'pdkef:downloads-recorded') return;
      clearTimeout(timer);
      timer = setTimeout(() => void run((e.source as ServiceWorker | null) ?? sw.controller), HINT_WAIT_MS); // reason: take catches everything itself
    });
  } catch {
    // expected: telemetry never throws and never blocks a tool
  }
}
