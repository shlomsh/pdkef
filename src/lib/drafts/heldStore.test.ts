import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it } from 'vitest';
import { reqToPromise, withStore } from './draftIdb.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { holdDraftStore } from './heldStore.test-helper.ts';

beforeEach(() => { indexedDB = new IDBFactory(); });

it('a write waits until the hold is released, then lands', async () => {
  const hold = await holdDraftStore();
  const order: string[] = [];
  const write = withStore('readwrite', (store) => reqToPromise(store.put({ tool: 'a' }))).then(() => order.push('write'));
  for (let turn = 0; turn < 50; turn += 1) await drainPromises();
  order.push('released');
  await hold.release();
  await write;
  expect(order).toEqual(['released', 'write']);
  expect(await withStore('readonly', (store) => reqToPromise(store.getKey('a')))).toBe('a');
});
