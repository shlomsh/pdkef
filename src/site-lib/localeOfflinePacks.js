// LOC-02: the page side of sw.js's locale packs (see LOCALE_PACK_MESSAGE
// there). Mirrors fontOfflinePacks.js: one MessageChannel round trip to the
// active worker, no polling, and a failure is a return value, never a thrown
// error the page has to care about - offline warming is a nicety layered on
// top of the runtime cache, which already stores any page on first visit.
export const LOCALE_PACK_MESSAGE = Object.freeze({
  status: 'pdkef:locale-pack-status',
  provision: 'pdkef:locale-pack-provision',
});

async function serviceWorkerTarget() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  const registration = await navigator.serviceWorker.ready;
  return registration.active || null;
}

async function requestWorker(type, packs) {
  const worker = await serviceWorkerTarget();
  if (!worker || typeof MessageChannel === 'undefined') return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => {
      channel.port1.close();
      resolve(data ?? null);
    };
    worker.postMessage({ type, packs }, [channel.port2]);
  });
}

/**
 * Asks the worker to make every published page of one edition available
 * offline. `pack` is `{ prefix, urls }` exactly as the build serialized it
 * (see LocalePackRequest.astro); an empty pack is a no-op, since a draft
 * edition has nothing published to warm.
 */
export async function provisionLocalePack(pack) {
  if (!pack || !Array.isArray(pack.urls) || pack.urls.length === 0) return false;
  const result = await requestWorker(LOCALE_PACK_MESSAGE.provision, [pack]);
  return result?.ready?.[pack.prefix] === true;
}
