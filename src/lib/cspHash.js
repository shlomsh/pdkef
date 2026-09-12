// Build-time only: the CSP hash of an inline style or script's exact text, in
// the form Astro's `Astro.csp.insertStyleHash` / `insertScriptHash` take.
// Astro hashes the styles it bundles itself; a component that emits a
// `<style is:inline>` (CompareFigure.astro, so only the pages that render it
// carry its CSS) has to register the hash for that page by hand. Plain JS so
// no Node type declarations are needed by the .astro file that imports it.
import { createHash } from 'node:crypto';

/**
 * @param {string} text
 * @returns {`sha256-${string}`} the shape Astro's CspHash type expects
 */
export function cspSha256(text) {
  return /** @type {`sha256-${string}`} */ (`sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`);
}
