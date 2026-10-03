import fs from 'fs';
import path from 'path';
import { vi } from 'vitest';

// signPdf fetches bundled fonts from same-origin `/fonts/<name>.ttf` at runtime.
// Node's test environment has no server, so serve the real files straight off
// disk — this keeps the test honest about which files actually exist (a missing
// file here fails exactly like a 404 would in the browser).
export function mockFontFetch() {
  const originalFetch = global.fetch;
  global.fetch = vi.fn(async (url) => {
    const match = /\/fonts\/(.+)$/.exec(String(url));
    if (!match) return originalFetch ? originalFetch(url) : Promise.reject(new Error('unexpected fetch'));
    const filePath = path.resolve(__dirname, '../../../../public/fonts', match[1]);
    if (!fs.existsSync(filePath)) {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const buffer = fs.readFileSync(filePath);
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(buffer).buffer };
  });
  return () => { global.fetch = originalFetch; };
}
