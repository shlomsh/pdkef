import { useCallback, useEffect, useState } from 'preact/hooks';

// Global preference, not per-tool: E9-view-density-control-spec.md 2.1. The
// key follows the existing pdf-toolkit:* convention (see draftStore.js).
const STORAGE_KEY = 'pdf-toolkit:view-density';
const DEFAULT_DENSITY = 'condensed';

function readStoredDensity() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'relaxed' || stored === 'condensed' ? stored : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

// Mirrors `density` onto `<html data-view-density>`, the same attribute the
// blocking inline script in ToolPageLayout.astro sets before first paint, so
// ToolHero.astro's collapse CSS (gated on that attribute) never has to know
// this hook exists. Reads its initial value from localStorage so a hydrated
// island agrees with whatever the pre-paint script already applied - no flash.
export default function useViewDensity() {
  const [density, setDensityState] = useState(readStoredDensity);

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-view-density', density);
      // `data-draft-hint` (ToolPageLayout.astro's pre-paint script) is a static
      // proxy for "density was condensed at load time AND a draft exists" - it
      // never updates itself afterward. ToolHero.astro's collapse CSS treats it
      // as its own, density-independent trigger, so once density flips away
      // from condensed at runtime this stale hint is the only thing left
      // holding the hero collapsed, and clicking Relaxed would silently do
      // nothing. Retiring it here keeps it truthful: it can only ever mean
      // what it claims to mean at the moment it's read.
      if (density !== 'condensed') {
        document.documentElement.removeAttribute('data-draft-hint');
      }
    } catch {
      // Locked-down/private-browsing contexts: the tool must not break because
      // a preference could not be applied.
    }
  }, [density]);

  const setDensity = useCallback((next) => {
    setDensityState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference just won't persist across reloads; not fatal.
    }
  }, []);

  return [density, setDensity];
}
