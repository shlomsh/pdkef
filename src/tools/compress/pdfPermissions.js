// Pure helpers for carrying a PDF's restrictions across a re-save.
const bit = (p, n) => ((p >> (n - 1)) & 1) === 1;

// The /P integer of a Standard security handler (PDF 32000-1 table 22) as pdf-lib's encrypt() permissions.
// `>> ` reads /P as a signed 32-bit integer, so negative values work.
export function permissionsFromP(p) {
  const printing = !bit(p, 3) ? false : bit(p, 12) ? 'highResolution' : 'lowResolution';
  return {
    printing,
    modifying: bit(p, 4),
    copying: bit(p, 5),
    annotating: bit(p, 6),
    fillingForms: bit(p, 9),
    contentAccessibility: bit(p, 10),
    documentAssembly: bit(p, 11),
  };
}

// A throwaway owner password: 32 hex chars. Nobody needs it; the user password stays empty.
export function randomOwnerPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
