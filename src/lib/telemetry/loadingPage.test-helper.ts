import { expect } from 'vitest';

/**
 * Puts jsdom's page back into its real loading state; `finishLoading` ends it.
 * @testSeam
 */
export function startLoading(): void {
  document.open();
  expect(document.readyState).toBe('loading');
}

/**
 * Closes the document and waits for the real `load` event; nothing to do on a page that has loaded.
 * @testSeam
 */
export async function finishLoading(): Promise<void> {
  if (document.readyState === 'complete') return;
  const loaded = new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  document.close();
  await loaded;
}
