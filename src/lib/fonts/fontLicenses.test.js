/**
 * fontManifest.js and fontLicenses.js are two hand-written modules that must
 * describe the same catalogue - a font registered in one and not the other is
 * exactly the drift this test exists to catch (ARCH-22 split the two apart so
 * license prose never enters the editor bundle; see both files' headers).
 */
import { describe, it, expect } from 'vitest';
import { FONT_MANIFEST } from './fontManifest.js';
import { FONT_LICENSES, licenseFor } from './fontLicenses.js';

describe('fontManifest.js and fontLicenses.js agree on which families exist', () => {
  it('has exactly the same family key set in both directions', () => {
    const manifestFamilies = FONT_MANIFEST.map((font) => font.family).sort();
    const licenseFamilies = Object.keys(FONT_LICENSES).sort();
    expect(licenseFamilies).toEqual(manifestFamilies);
  });

  it('gives every family real license metadata', () => {
    for (const font of FONT_MANIFEST) {
      const license = licenseFor(font.family);
      expect(license.version).toBeTruthy();
      expect(license.url).toMatch(/^https:\/\//);
      expect(license.copyright).toMatch(/Copyright|\(c\)|©/i);
    }
  });

  it('licenseFor throws for a family neither module ships', () => {
    expect(() => licenseFor('Not A Real Font')).toThrow(/No license metadata/);
  });
});
