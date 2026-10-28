import { describe, expect, it, vi } from 'vitest';
import { reportSwInstallFailures } from './swInstallReport.ts';

const BASE = 'https://pdkef.test';
const REC = '/__maint/sw-install/';
const SENT = '/__maint/sw-install-sent/';

// In-memory CacheStorage: one cache, insertion-ordered like the real one.
function fakeCaches(initial: Record<string, string> = {}, opts: { exists?: boolean } = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  let exists = opts.exists ?? true;
  const abs = (k: unknown) => new URL(typeof k === 'string' ? k : (k as Request).url, BASE).pathname;
  const cache = {
    keys: async () => [...store.keys()].map((p) => new Request(BASE + p)),
    match: async (k: unknown) => (store.has(abs(k)) ? new Response(store.get(abs(k))) : undefined),
    put: async (k: unknown, res: Response) => { store.set(abs(k), await res.text()); },
    delete: async (k: unknown) => store.delete(abs(k)),
  };
  const caches = {
    has: vi.fn(async () => exists),
    open: vi.fn(async () => { exists = true; return cache; }),
  };
  return { caches, store };
}

const rec = (build: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, build, reason: 'storage', missed: '0', ...over });

describe('reportSwInstallFailures', () => {
  it('sends one record exactly as the schema wants, without the build id, then writes a tombstone', async () => {
    const { caches, store } = fakeCaches({ [REC + 'b1']: rec('b1', { reason: 'files_missed', missed: '2-5' }) });
    const send = vi.fn();
    await reportSwInstallFailures({ caches, send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ name: 'sw_install', properties: { outcome: 'failure', reason: 'files_missed', missed: '2-5' } });
    expect(JSON.stringify(send.mock.calls)).not.toContain('b1');
    expect(store.has(SENT + 'b1')).toBe(true);
  });

  it('reads the same state on two page loads and sends once in total', async () => {
    const { caches } = fakeCaches({ [REC + 'b1']: rec('b1') });
    const send = vi.fn();
    await reportSwInstallFailures({ caches, send });
    await reportSwInstallFailures({ caches, send });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not send a record that has a tombstone', async () => {
    const { caches } = fakeCaches({ [REC + 'b1']: rec('b1'), [SENT + 'b1']: '1' });
    const send = vi.fn();
    await reportSwInstallFailures({ caches, send });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['bad JSON', '{nope'],
    ['unknown reason', rec('b1', { reason: 'mystery' })],
    ['unknown bucket', rec('b1', { missed: '7' })],
    ['version 2', rec('b1', { v: 2 })],
  ])('deletes a malformed record (%s) and never sends it', async (_n, body) => {
    const { caches, store } = fakeCaches({ [REC + 'b1']: body });
    const send = vi.fn();
    await reportSwInstallFailures({ caches, send });
    expect(send).not.toHaveBeenCalled();
    expect(store.has(REC + 'b1')).toBe(false);
  });

  it('never opens (so never creates) the cache when it does not exist', async () => {
    const { caches } = fakeCaches({}, { exists: false });
    const send = vi.fn();
    await reportSwInstallFailures({ caches, send });
    expect(caches.open).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('resolves when send throws', async () => {
    const { caches } = fakeCaches({ [REC + 'b1']: rec('b1') });
    await expect(reportSwInstallFailures({ caches, send: () => { throw new Error('x'); } })).resolves.toBeUndefined();
  });

  it('resolves when the cache throws', async () => {
    const caches = { has: async () => { throw new Error('x'); }, open: async () => { throw new Error('y'); } };
    await expect(reportSwInstallFailures({ caches, send: vi.fn() })).resolves.toBeUndefined();
    const openThrows = { has: async () => true, open: async () => { throw new Error('y'); } };
    await expect(reportSwInstallFailures({ caches: openThrows, send: vi.fn() })).resolves.toBeUndefined();
  });

  it('removes tombstones that have no record', async () => {
    const { caches, store } = fakeCaches({ [REC + 'b2']: rec('b2'), [SENT + 'gone']: '1', [SENT + 'b2']: '1' });
    await reportSwInstallFailures({ caches, send: vi.fn() });
    expect(store.has(SENT + 'gone')).toBe(false);
    expect(store.has(SENT + 'b2')).toBe(true);
  });

  it('keeps at most 5 records, dropping the oldest with their tombstones', async () => {
    const init: Record<string, string> = {};
    for (let i = 1; i <= 8; i++) init[REC + `b${i}`] = rec(`b${i}`);
    const { caches, store } = fakeCaches(init);
    await reportSwInstallFailures({ caches, send: vi.fn() });
    const records = [...store.keys()].filter((k) => k.startsWith(REC));
    expect(records).toEqual([3, 4, 5, 6, 7, 8].slice(1).map((i) => REC + `b${i}`));
    expect([...store.keys()].filter((k) => k.startsWith(SENT)).sort()).toEqual(records.map((k) => SENT + k.slice(REC.length)).sort());
  });
});
