import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resetLiveFontCoverageCache, unsupportedCharacters } from './liveFontCoverage.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');

/**
 * The editor-side half of layer 3: catch an unrepresentable character while
 * the user is still typing, not when they press save
 * (docs/hebrew-text-shaping-export.md). Reads the real asset bytes, the same
 * way fontCoverage.test.js judges the catalogue - a mocked font would prove
 * nothing about coverage.
 */
beforeEach(() => {
  resetLiveFontCoverageCache();
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const name = String(url).split('/').pop();
    try {
      const bytes = readFileSync(join(FONT_DIR, name));
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    } catch {
      return { ok: false, status: 404 };
    }
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('unsupportedCharacters (live editor check)', () => {
  it('flags emoji while the user is typing, in the font the export would embed', async () => {
    // Arabic, then Chinese, then Pashto were each this test's example in
    // turn, and each stopped being genuinely unrepresentable as its font
    // landed (Almarai gaining Arabic; Noto Sans SC/TC covering shared Han
    // characters, see fonts.js's CATALOGUE comment; Scheherazade New
    // covering Pashto's eleven extra letters). Emoji remains the one
    // fixture stable against the catalogue growing (see TODO.md).
    expect(await unsupportedCharacters('\ud83d\ude00\ud83c\udf89', { fontFamily: 'Heebo' }))
      .toEqual(['\ud83d\ude00', '\ud83c\udf89']);
  });

  it('flags an emoji mixed into otherwise fine Hebrew', async () => {
    expect(await unsupportedCharacters('\u05e9\u05dc\u05d5\u05dd \u{1F600}', { fontFamily: 'Heebo' }))
      .toEqual(['\u{1F600}']);
  });

  it('stays quiet on text every bundled font can draw', async () => {
    expect(await unsupportedCharacters('\u05e8\u05d7\u05d5\u05d1 17, Tel Aviv', { fontFamily: 'Heebo' })).toEqual([]);
  });

  it('stays quiet on invisible formatting characters the user cannot see', async () => {
    // Same false-positive class the export-side check had to exclude: an RLM
    // pasted in from Word must not raise a warning naming a character nobody
    // can find. Gveret Levin on purpose - it genuinely lacks the RLM, where
    // Arimo has a glyph for it and the test would pass vacuously.
    expect(await unsupportedCharacters('\u05e9\u05dc\u05d5\u05dd\u200f\u05e2\u05d5\u05dc\u05dd', { fontFamily: 'Gveret Levin' })).toEqual([]);
  });

  it('judges the substituted family, matching what the export will embed', async () => {
    // Hebrew typed into a Latin-only handwriting face is substituted to Gveret
    // Levin by resolveFontFamily, so it must not be reported as unsupported
    // even though Caveat itself has no Hebrew at all.
    expect(await unsupportedCharacters('\u05e9\u05dc\u05d5\u05dd', { fontFamily: 'Caveat' })).toEqual([]);
  });

  it('reports nothing when the font cannot be fetched, rather than inventing a warning', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    expect(await unsupportedCharacters('\u0645\u0631\u062d\u0628\u0627', { fontFamily: 'Heebo' })).toEqual([]);
  });

  it('fetches each font file once and reuses the parsed instance', async () => {
    await Promise.all([
      unsupportedCharacters('\u05e9\u05dc\u05d5\u05dd', { fontFamily: 'Heebo' }),
      unsupportedCharacters('\u05e2\u05d5\u05dc\u05dd', { fontFamily: 'Heebo' })
    ]);
    await unsupportedCharacters('\u05e9\u05dc\u05d5\u05dd', { fontFamily: 'Heebo' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('rechecks real font coverage after an offline fetch fails, then caches the recovery', async () => {
    const fetchFont = globalThis.fetch;
    let online = false;
    vi.stubGlobal('fetch', vi.fn((url) => online
      ? fetchFont(url)
      : Promise.reject(new TypeError('Failed to fetch'))));

    expect(await unsupportedCharacters('\u{1F600}', { fontFamily: 'Heebo' })).toEqual([]);
    online = true;
    expect(await unsupportedCharacters('\u{1F600}', { fontFamily: 'Heebo' })).toEqual(['\u{1F600}']);

    const callsAfterRecovery = globalThis.fetch.mock.calls.length;
    await unsupportedCharacters('\u{1F600}', { fontFamily: 'Heebo' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(callsAfterRecovery);
  });
});
