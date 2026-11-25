import { vi } from 'vitest';

export function mockNativeFileShare() {
  const originalShare = navigator.share;
  const originalCanShare = navigator.canShare;
  // Forced: jsdom has no navigator.share or canShare
  const share = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  // Forced: jsdom has no navigator.share or canShare
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });

  return {
    share,
    restore() {
      if (originalShare === undefined) delete navigator.share;
      else Object.defineProperty(navigator, 'share', { configurable: true, value: originalShare });
      if (originalCanShare === undefined) delete navigator.canShare;
      else Object.defineProperty(navigator, 'canShare', { configurable: true, value: originalCanShare });
    },
  };
}
