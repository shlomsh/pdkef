/**
 * Fill mode (SNG-15) is opt-in, on `?next=1` alone - so every existing Sign
 * session keeps its current behaviour until a person asks for the next one
 * by name (docs/sign-fill-mode.md).
 */

/** True only when the query string carries `next=1`, exactly. */
export function isFillMode(search: string): boolean {
  return new URLSearchParams(search).get('next') === '1';
}
