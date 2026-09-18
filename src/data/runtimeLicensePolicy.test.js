import { describe, expect, it } from 'vitest';
import {
  APPROVED_RUNTIME_LICENSES,
  RUNTIME_ROOT_PACKAGES,
  RUNTIME_PACKAGE_NAMES,
} from './runtimeLicensePolicy.js';

// CLAUDE.md's "Runtime dependencies must use the permissive-license allowlist"
// line is the human-readable source of truth for this policy; this test keeps
// the constant honest against its wording rather than against itself.
const CLAUDE_MD_ALLOWLIST = ['MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Zlib', '0BSD'];

describe('runtimeLicensePolicy', () => {
  it('RUNTIME_PACKAGE_NAMES is a superset of RUNTIME_ROOT_PACKAGES', () => {
    const names = new Set(RUNTIME_PACKAGE_NAMES);
    for (const root of RUNTIME_ROOT_PACKAGES) {
      expect(names.has(root)).toBe(true);
    }
  });

  it('has no duplicate package names', () => {
    expect(new Set(RUNTIME_ROOT_PACKAGES).size).toBe(RUNTIME_ROOT_PACKAGES.length);
    expect(new Set(RUNTIME_PACKAGE_NAMES).size).toBe(RUNTIME_PACKAGE_NAMES.length);
  });

  it('APPROVED_RUNTIME_LICENSES contains exactly CLAUDE.md\'s named allowlist', () => {
    // Every license CLAUDE.md names must be approved.
    for (const license of CLAUDE_MD_ALLOWLIST) {
      expect(APPROVED_RUNTIME_LICENSES.has(license)).toBe(true);
    }
    // Anything approved beyond that wording must be a compound SPDX expression
    // built only from already-named licenses (e.g. pako's "(MIT AND Zlib)"),
    // never a bare license CLAUDE.md doesn't name.
    for (const license of APPROVED_RUNTIME_LICENSES) {
      if (CLAUDE_MD_ALLOWLIST.includes(license)) continue;
      const isCompoundOfNamedLicenses = /^\(.+\)$/.test(license)
        && license
          .slice(1, -1)
          .split(/\s+(?:AND|OR)\s+/)
          .every((part) => CLAUDE_MD_ALLOWLIST.includes(part));
      expect(isCompoundOfNamedLicenses).toBe(true);
    }
  });

  it('has no duplicate approved licenses', () => {
    const asArray = [...APPROVED_RUNTIME_LICENSES];
    expect(new Set(asArray).size).toBe(asArray.length);
  });
});
