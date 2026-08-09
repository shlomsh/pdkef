import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/**
 * Owns exactly one object URL's lifecycle: creating it from a Blob, revoking
 * the previous one whenever it's replaced or cleared, and revoking whatever
 * is current on unmount. Every single-output tool hand-rolled the
 * replace/clear half correctly on its own - but only Split ever added the
 * unmount half, so every other single-output tool leaked its blob if
 * unmounted mid-"done". That's latent rather than user-visible today (this
 * is a full-page-navigation app; nothing unmounts a tool without tearing
 * down the whole document, which reclaims everything regardless), but the
 * inconsistency itself - one owner-tracked implementation instead of five
 * hand-copied ones - is worth closing on its own.
 */
export function useObjectUrls() {
  const [url, setUrlState] = useState(null);
  const currentRef = useRef(null);

  const setBlob = useCallback((blob) => {
    setUrlState((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      const next = blob ? URL.createObjectURL(blob) : null;
      currentRef.current = next;
      return next;
    });
  }, []);

  const clear = useCallback(() => setBlob(null), [setBlob]);

  useEffect(() => {
    return () => {
      if (currentRef.current) URL.revokeObjectURL(currentRef.current);
    };
  }, []);

  return { url, setBlob, clear };
}
