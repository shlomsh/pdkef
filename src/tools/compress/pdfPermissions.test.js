import { describe, expect, it } from 'vitest';
import { permissionsFromP, randomOwnerPassword } from './pdfPermissions.js';

const none = {
  printing: false,
  modifying: false,
  copying: false,
  annotating: false,
  fillingForms: false,
  contentAccessibility: false,
  documentAssembly: false,
};

describe('permissionsFromP', () => {
  it('reads a real value: print, accessibility and high-res print only', () => {
    expect(permissionsFromP(-1340)).toEqual({ ...none, printing: 'highResolution', contentAccessibility: true });
  });
  it('reads all bits as everything allowed', () => {
    expect(permissionsFromP(-4)).toEqual({
      printing: 'highResolution',
      modifying: true,
      copying: true,
      annotating: true,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: true,
    });
  });
  it('gives low resolution when print is on and high-quality print is off', () => {
    expect(permissionsFromP(1 << 2).printing).toBe('lowResolution');
  });
  it('gives no printing when bit 3 is off, even with bit 12 on', () => {
    expect(permissionsFromP(1 << 11).printing).toBe(false);
  });
});

describe('randomOwnerPassword', () => {
  it('is 32 hex chars and differs per call', () => {
    const a = randomOwnerPassword();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomOwnerPassword()).not.toBe(a);
  });
});
