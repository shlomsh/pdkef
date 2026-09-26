/**
 * SNG-18: the home page navigates by setting `window.location.href` to a
 * tool's canonical URL (`FileDropzone.tsx`'s `handOff`/`openRecent`), which
 * always drops any existing query string - including the `next` param that
 * picks Sign's editor (`src/tools/sign/fill/fillMode.ts`). Loading the
 * practice form or a recent file while on `/?next=0` landed on `/sign/`
 * with the old editor silently swapped for fill mode. This carries whatever
 * `next` value is present through, and only that: it is not a general query
 * string forwarder.
 */
export function withFillModeParam(href: string, currentSearch: string): string {
  const next = new URLSearchParams(currentSearch).get('next');
  if (next === null) return href;
  return href.includes('?') ? `${href}&next=${encodeURIComponent(next)}` : `${href}?next=${encodeURIComponent(next)}`;
}
