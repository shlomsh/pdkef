type Camera = typeof import('../../components/Viewfinder.tsx');

/** Loads once and shares the promise, but forgets a rejected one so a flaky chunk load can be retried.
 * @testSeam */
export function onceUntilFailed<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      const p = load();
      pending = p;
      // expected: the caller sees the rejection on its own promise; this only lets the next call retry
      p.catch(() => { if (pending === p) pending = null; });
    }
    return pending;
  };
}

/** The viewfinder, camera hook and their code load once, when Start scanning is first touched. */
export const loadViewfinder: () => Promise<Camera> = onceUntilFailed(() => import('../../components/Viewfinder.tsx'));
