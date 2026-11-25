import { onTestFinished } from 'vitest';
import { reqToPromise, withStore } from './draftIdb.ts';

/**
 * Holds a real write transaction open on the draft store, so every later read or write waits behind it,
 * as it would behind another tab's long write. `release()` resolves once the hold has committed;
 * the end of the test releases it too.
 * @testSeam
 */
export async function holdDraftStore(): Promise<{ release(): Promise<void> }> {
  const started = Promise.withResolvers<void>();
  let held = true;
  const done = withStore('readwrite', async (store) => {
    do {
      await reqToPromise(store.getKey('nothing'));
      started.resolve();
    } while (held);
  });
  const release = () => {
    held = false;
    return done;
  };
  onTestFinished(release);
  await started.promise;
  return { release };
}
