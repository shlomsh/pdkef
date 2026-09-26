/**
 * Fill mode (SNG-15) is Sign's default since SNG-19. `?next=0` keeps the old
 * editor until SNG-06 retires it; any other value (no param, `next=1`,
 * anything else) is fill mode (docs/sign-fill-mode.md).
 */

/** False only when the query string carries `next=0`, exactly. */
export function isFillMode(search: string): boolean {
  return new URLSearchParams(search).get('next') !== '0';
}
