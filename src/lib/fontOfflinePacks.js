import { DEFAULT_FONT_FAMILY, FONT_BY_FAMILY } from '../editor/text/fontManifest.js';

export const FONT_PACK_MESSAGE = Object.freeze({
  status: 'pdkef:font-pack-status',
  provision: 'pdkef:font-pack-provision',
});

/**
 * Offline font packs are deliberately family-sized. A user who makes a family
 * available gets every real face the picker can offer for it, so switching to
 * bold or italic while disconnected cannot turn a green readiness signal into
 * an export failure. The canonical generated manifest is the only catalogue.
 */
export function fontPackDescriptor(family) {
  const font = FONT_BY_FAMILY[family];
  if (!font || family === DEFAULT_FONT_FAMILY) return null;
  return {
    family,
    urls: [...new Set(Object.values(font.faces).map((file) => `/fonts/${file}`))],
  };
}

async function serviceWorkerTarget() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  const registration = await navigator.serviceWorker.ready;
  return registration.active || null;
}

async function requestWorker(type, packs) {
  const worker = await serviceWorkerTarget();
  if (!worker || typeof MessageChannel === 'undefined') {
    throw new Error('Offline font setup is unavailable in this browser.');
  }
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => {
      channel.port1.close();
      if (data?.ok) resolve(data);
      else reject(new Error(data?.error || 'Could not update offline fonts.'));
    };
    worker.postMessage({ type, packs }, [channel.port2]);
  });
}

export async function getFontPackReadiness(families) {
  const packs = families.map(fontPackDescriptor).filter(Boolean);
  if (packs.length === 0) return {};
  const result = await requestWorker(FONT_PACK_MESSAGE.status, packs);
  return result.ready || {};
}

export async function provisionFontPack(family) {
  const pack = fontPackDescriptor(family);
  if (!pack) return true;
  const result = await requestWorker(FONT_PACK_MESSAGE.provision, [pack]);
  return result.ready?.[family] === true;
}
