/**
 * SNG-18: the home page navigates by setting `window.location.href` to a
 * tool's canonical URL (`FileDropzone.tsx`'s `handOff`/`openRecent`), which
 * always drops any existing query string - including fill mode's `?next=1`
 * (`src/tools/sign/fill/fillMode.ts`). Loading the practice form or a recent
 * file while on `/?next=1` landed on `/sign/` with fill mode silently off.
 * This carries `next=1` through, and only that: it is not a general query
 * string forwarder.
 */
export function withFillModeParam(href: string, currentSearch: string): string {
  if (new URLSearchParams(currentSearch).get('next') !== '1') return href;
  return href.includes('?') ? `${href}&next=1` : `${href}?next=1`;
}
