import { describe, expect, it } from 'vitest';
import {
  HERO_DEMO_UNIVERSAL_KEYS,
  englishHeroDemoMessages,
  getHeroDemoMessages,
  hebrewHeroDemoMessages,
} from './heroDemoMessages';

const EM_DASH = '—';

/** Flattens the catalogue to a flat key -> string map, so the three nested
 * objects (`signCaption`, `blurCaption`, `scrollHint`) get checked the same
 * way as every other key instead of being skipped by `Object.entries`. */
function flatten(messages: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === 'string') {
      out[key] = value;
    } else if (value && typeof value === 'object') {
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, string>)) {
        out[`${key}.${nestedKey}`] = nestedValue;
      }
    }
  }
  return out;
}

const flatEnglish = flatten(englishHeroDemoMessages);
const flatHebrew = flatten(hebrewHeroDemoMessages);

// Two edge cases inside the nested caption objects, not covered by
// HERO_DEMO_UNIVERSAL_KEYS (which is typed to the catalogue's own top-level
// keys - see its comment in heroDemoMessages.ts): `blurCaption.after` is
// legitimately empty in English ("Keep the <mark>private</mark> bits
// private." has no trailing punctuation before the line break, unlike the
// sign caption's comma), moved unchanged from the frontmatter ternary this
// catalogue replaced. `signCaption.after` is a bare "," in both locales -
// the same punctuation mark, not an untranslated word.
const ALLOWED_EMPTY_KEYS = new Set(['blurCaption.after']);
const NESTED_UNIVERSAL_KEYS = new Set(['signCaption.after']);

describe('hero demo messages', () => {
  // Mirrors toolMessages.test.ts's own contract test: the English catalogue
  // is what every existing English render asserts against, and the Hebrew
  // catalogue has to cover the exact same surface or a locale falls back to
  // a half-translated demo silently, one key at a time.
  it('gives the Hebrew catalogue the exact same keys as the English one', () => {
    expect(Object.keys(flatHebrew).sort()).toEqual(Object.keys(flatEnglish).sort());
  });

  it('every value, in both locales, is a non-empty string (except the documented empty caption suffix)', () => {
    for (const [key, value] of Object.entries(flatEnglish)) {
      expect(typeof value, `englishHeroDemoMessages.${key}`).toBe('string');
      if (ALLOWED_EMPTY_KEYS.has(key)) continue;
      expect(value.length, `englishHeroDemoMessages.${key}`).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(flatHebrew)) {
      expect(typeof value, `hebrewHeroDemoMessages.${key}`).toBe('string');
      if (ALLOWED_EMPTY_KEYS.has(key)) continue;
      expect(value.length, `hebrewHeroDemoMessages.${key}`).toBeGreaterThan(0);
    }
  });

  // CLAUDE.md's voice guide: no em dashes anywhere in user-facing copy.
  it('never uses an em dash, in either locale', () => {
    for (const [key, value] of Object.entries(flatEnglish)) {
      expect(value.includes(EM_DASH), `englishHeroDemoMessages.${key}`).toBe(false);
    }
    for (const [key, value] of Object.entries(flatHebrew)) {
      expect(value.includes(EM_DASH), `hebrewHeroDemoMessages.${key}`).toBe(false);
    }
  });

  it('falls back to English for any locale but "he"', () => {
    expect(getHeroDemoMessages('fr')).toEqual(englishHeroDemoMessages);
    expect(getHeroDemoMessages('en')).toEqual(englishHeroDemoMessages);
    expect(getHeroDemoMessages('')).toEqual(englishHeroDemoMessages);
  });

  it('returns the Hebrew catalogue, spread over English, for "he"', () => {
    expect(getHeroDemoMessages('he')).toEqual({ ...englishHeroDemoMessages, ...hebrewHeroDemoMessages });
  });

  // The demo is a translation, not a reskin: every key must actually read
  // differently in Hebrew, except the explicit allowlist of values the
  // catalogue deliberately keeps identical (the blurred/blacked-out/
  // whited-out bill digits a visual effect is meant to hide, a shared
  // file-size unit convention, and one shared clock reading - see
  // HERO_DEMO_UNIVERSAL_KEYS's own comment in heroDemoMessages.ts).
  it('differs from English on every key except the universal allowlist', () => {
    const universal = new Set<string>(HERO_DEMO_UNIVERSAL_KEYS);
    for (const key of Object.keys(flatEnglish)) {
      if (universal.has(key) || NESTED_UNIVERSAL_KEYS.has(key)) continue;
      expect(flatHebrew[key], key).not.toBe(flatEnglish[key]);
    }
  });

  it('keeps every universal-allowlisted key identical between locales', () => {
    for (const key of HERO_DEMO_UNIVERSAL_KEYS) {
      expect(flatHebrew[key], key).toBe(flatEnglish[key]);
    }
  });
});
