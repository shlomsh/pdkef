/**
 * Moves the draft database to version 2 behind the product's back, so the product's own open at
 * version 1 fails with a real VersionError. Needs a fresh IDBFactory per test to start from version 1 again.
 * @testSeam
 */
export function openNewerStore(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('pdf-toolkit-workspace', 2);
    request.onupgradeneeded = () => {
      // A database the product already made at version 1 has the store; a fresh one does not.
      if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace', { keyPath: 'tool' });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}
