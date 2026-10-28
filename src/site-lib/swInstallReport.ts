/**
 * MEM-24: reports a service worker install failure the worker recorded.
 * The worker only writes a record to Cache Storage; this page reads it, sends
 * one `sw_install` event per build and leaves a tombstone so a later load
 * stays quiet. The build id never leaves the device.
 */
import { SW_INSTALL_MISSED_BUCKETS, SW_INSTALL_REASONS, type MaintenanceEvent } from '#lib/telemetry/maintenanceEventSchema.ts';

const CACHE = 'maint-sw-v1';
const RECORD = '/__maint/sw-install/';
const SENT = '/__maint/sw-install-sent/';
const MAX_RECORDS = 5;

interface CacheLike {
  keys(): Promise<ReadonlyArray<{ url: string }>>;
  match(key: string): Promise<{ json(): Promise<unknown> } | undefined>;
  put(key: string, res: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
}
interface Deps {
  caches: { has(name: string): Promise<boolean>; open(name: string): Promise<CacheLike> };
  send: (event: MaintenanceEvent) => boolean;
}

const inList = (list: readonly string[], v: unknown): v is string => typeof v === 'string' && list.includes(v);

export async function reportSwInstallFailures({ caches, send }: Deps): Promise<void> {
  try {
    if (!(await caches.has(CACHE))) return; // never creates the cache on a healthy device
    const cache = await caches.open(CACHE);
    const paths = (await cache.keys()).map((k) => new URL(k.url).pathname);
    const sent = new Set(paths.filter((p) => p.startsWith(SENT)).map((p) => p.slice(SENT.length)));
    // Cache keys come back oldest first, so this list is oldest first too.
    const builds: string[] = [];
    for (const path of paths.filter((p) => p.startsWith(RECORD))) {
      const build = path.slice(RECORD.length);
      let body: any = null;
      try {
        body = await (await cache.match(path))?.json();
      } catch {
        // expected: an unreadable record is dropped below
      }
      if (body?.v !== 1 || !inList(SW_INSTALL_REASONS, body.reason) || !inList(SW_INSTALL_MISSED_BUCKETS, body.missed)) {
        await cache.delete(path);
        continue;
      }
      builds.push(build);
      if (sent.has(build)) continue;
      let went = false;
      try {
        went = send({ name: 'sw_install', properties: { outcome: 'failure', reason: body.reason, missed: body.missed } } as MaintenanceEvent) === true;
      } catch {
        // expected: a failed send must not stop the pass, and leaves no tombstone
      }
      if (!went) continue;
      await cache.put(SENT + build, new Response('1'));
      sent.add(build);
    }
    for (const build of sent) if (!builds.includes(build)) await cache.delete(SENT + build);
    for (const build of builds.slice(0, Math.max(0, builds.length - MAX_RECORDS))) {
      await cache.delete(RECORD + build);
      await cache.delete(SENT + build);
    }
  } catch {
    // expected: maintenance only, never reaches the page
  }
}
