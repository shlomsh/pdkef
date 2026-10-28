import { reportError } from '../telemetry/errorReport.ts';

// The catches below also cover opening the database, which fails in private or
// locked-down windows (InvalidStateError, UnknownError). That is the
// environment, not a defect, so those two names are not reported.
export function reportStoreError(area: Parameters<typeof reportError>[0], error: unknown, step: string) {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'InvalidStateError' || name === 'UnknownError') return;
  reportError(area, error, step);
}

// This is intentionally a fixed schema with no upgrade path. Safari can leave
// an installed app's previous page attached to an old database version, which
// turns an ordinary schema upgrade into an indefinitely blocked `open()`
// request. Fields may be added to a record without changing an IndexedDB
// object store, so this database never needs one; MEM-01's entry model is
// itself such a change (same DB, same store, same keyPath, just richer
// records under the keys already in use) and the legacy per-tool records
// are folded into it by `migrateLegacyDraft` below, not by a version bump.
export const DB_NAME = 'pdf-toolkit-workspace';
export const STORE_NAME = 'workspace';
export const DB_VERSION = 1;

export function hasIndexedDB() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // expected: Accessing indexedDB can throw in some locked-down/Safari-private contexts.
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'tool' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Run a single transaction against the workspace store and resolve with `resultFn`'s
// value once the transaction commits. Closes the connection afterwards.
export async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => T | Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result: T;
      Promise.resolve(work(store))
        .then((value) => {
          result = value;
        })
        // expected: forwards the error to the transaction promise rejection
        .catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function reqToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
