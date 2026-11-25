import { vi } from 'vitest';

const nextFrame = globalThis.requestAnimationFrame;
const later = globalThis.setTimeout;

// Preact runs effects after the next paint, with a 100 ms timer in case no frame comes. A file that ends
// first takes jsdom down under that timer, which then fails the run: "cancelAnimationFrame is not defined".
export async function drainAfterPaint(): Promise<void> {
  vi.useRealTimers();
  await new Promise<void>((resolve) => nextFrame.call(globalThis, () => later(resolve)));
}
