import { useEffect } from 'preact/hooks';
import { lockedViewportContent } from './viewportLock.ts';

// SNG-16: in Sign fill mode (`?next=1`) the app owns zoom, so iOS must never
// zoom the page itself. The static viewport meta
// (`src/layouts/BaseLayout.astro`) stays
// `width=device-width, initial-scale=1, viewport-fit=cover` for production;
// this hook mutates it at runtime, only while fill mode is on, via a plain
// DOM write (no inline script, CSP-safe), and restores the exact original
// content on disable or unmount.
//
// SNG-14 measured on iOS: `maximum-scale=1` alone still let iOS zoom OUT to
// ~0.6 on a wide field; adding `minimum-scale=1` stopped it, so both are
// required together with `initial-scale=1` (see viewportLock.ts).

/**
 * While `enabled` is true, locks the document's `meta[name="viewport"]`
 * content so iOS cannot zoom the page. Restores the original content when
 * `enabled` becomes false or the component unmounts. No-op if the meta tag
 * is not present in the document.
 */
export function useViewportScaleLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;

    const original = meta.getAttribute('content') ?? '';
    meta.setAttribute('content', lockedViewportContent(original));

    return () => {
      meta.setAttribute('content', original);
    };
  }, [enabled]);
}
