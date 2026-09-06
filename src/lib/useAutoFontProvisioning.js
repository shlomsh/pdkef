import { useEffect, useRef } from 'preact/hooks';
import { resolveFontSubstitution } from '../editor/text/fonts.js';
import { fontPackDescriptor, provisionFontPack } from './fontOfflinePacks.js';

/**
 * Non-default font families are cached on first use rather than bundled for
 * every visitor (~37MB catalogue - see fontOfflinePacks.js). That used to
 * require a separate "Make offline" click in the font picker; the user
 * already made the real decision by typing in that family, so the download
 * doesn't need a second one and happens quietly in the background instead.
 * Provisions the resolved (rendered/exported) family per text element, not
 * necessarily the raw fontFamily field, since that's what export embeds.
 */
export function useAutoFontProvisioning(elements) {
  const attempted = useRef(new Set());

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const families = new Set();
    for (const element of elements) {
      if (element.type !== 'text' || !element.text) continue;
      const { family } = resolveFontSubstitution(
        element.fontFamily,
        element.text,
        element.fontWeight || 'normal',
        element.fontStyle || 'normal',
      );
      families.add(family);
    }
    for (const family of families) {
      if (attempted.current.has(family) || !fontPackDescriptor(family)) continue;
      attempted.current.add(family);
      provisionFontPack(family).catch(() => attempted.current.delete(family));
    }
  }, [elements]);
}
