import { useCallback, useEffect, useState } from 'preact/hooks';

// Global preference, not per-tool: view-density-control-spec.md 2.1. The
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
/** @returns {[string, (next: string) => void]} */
export default function useViewDensity() {
  const [density, setDensityState] = useState(readStoredDensity);

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-view-density', density);
      // `data-draft-hint` is the first-paint signal that saved work may load.
      // It must outlive a density change because ToolPageLayout uses it to
      // reserve the editor's desktop geometry during restoration. ToolHero
      // independently gates its compact presentation on this density value,
      // so Relaxed still expands the hero without discarding the restore hint.
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
