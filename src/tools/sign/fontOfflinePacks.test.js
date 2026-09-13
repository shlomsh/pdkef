import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FONT_PACK_MESSAGE,
  fontPackDescriptor,
  getFontPackReadiness,
  provisionFontPack,
} from './fontOfflinePacks.js';

const originalServiceWorker = navigator.serviceWorker;
const OriginalMessageChannel = globalThis.MessageChannel;

function installWorker(replyFor) {
  class FakeMessageChannel {
    constructor() {
      this.port1 = { onmessage: null, close: vi.fn() };
      this.port2 = {
        postMessage: (data) => queueMicrotask(() => this.port1.onmessage?.({ data })),
      };
    }
  }
  const worker = {
    postMessage: vi.fn((message, [replyPort]) => replyPort.postMessage(replyFor(message))),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller: worker },
  });
  globalThis.MessageChannel = FakeMessageChannel;
  return worker;
}

afterEach(() => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: originalServiceWorker,
  });
  globalThis.MessageChannel = OriginalMessageChannel;
});

describe('offline font packs', () => {
  it('derives every face from the generated manifest and excludes the precached default family', () => {
    expect(fontPackDescriptor('Scheherazade New')).toEqual({
      family: 'Scheherazade New',
      urls: ['/fonts/ScheherazadeNew-Regular.ttf', '/fonts/ScheherazadeNew-Bold.ttf'],
    });
    expect(fontPackDescriptor('Noto Sans SC')).toEqual({
      family: 'Noto Sans SC',
      urls: ['/fonts/NotoSansSC-Regular.ttf', '/fonts/NotoSansSC-Bold.ttf'],
    });
    expect(fontPackDescriptor('Arimo')).toBeNull();
    expect(fontPackDescriptor('Not a font')).toBeNull();
  });

  it('asks the active service worker for readiness in one batch', async () => {
    const worker = installWorker((message) => ({
      ok: true,
      ready: Object.fromEntries(message.packs.map((pack) => [pack.family, pack.family === 'Noto Sans SC'])),
    }));

    await expect(getFontPackReadiness(['Arimo', 'Noto Sans SC', 'Scheherazade New'])).resolves.toEqual({
      'Noto Sans SC': true,
      'Scheherazade New': false,
    });
    expect(worker.postMessage.mock.calls[0][0].type).toBe(FONT_PACK_MESSAGE.status);
    expect(worker.postMessage.mock.calls[0][0].packs).toHaveLength(2);
  });

  it('provisions the complete family and returns only the worker-confirmed state', async () => {
    const worker = installWorker((message) => ({ ok: true, ready: { [message.packs[0].family]: true } }));

    await expect(provisionFontPack('Noto Sans Bengali')).resolves.toBe(true);
    expect(worker.postMessage.mock.calls[0][0]).toEqual({
      type: FONT_PACK_MESSAGE.provision,
      packs: [{
        family: 'Noto Sans Bengali',
        urls: ['/fonts/NotoSansBengali-Regular.ttf', '/fonts/NotoSansBengali-Bold.ttf'],
      }],
    });
  });
});
