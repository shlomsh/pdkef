import { act } from 'preact/test-utils';

// Waits for a condition instead of a fixed sleep; a lazy import takes as long as the machine is busy.
// Preact's act holds renders until it exits, so poll in short acts rather than inside one.
export const until = async (cond, timeout = 8000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error(`condition not met within ${timeout}ms: ${cond}`);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
};
