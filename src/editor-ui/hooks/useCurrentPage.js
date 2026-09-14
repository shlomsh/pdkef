import { useEffect, useState } from 'preact/hooks';

/**
 * Tracks which page is most visible inside a scrollable workspace, for the
 * fullscreen "Page X of N" indicator (see describeFile() in format.js). Only
 * useful in fullscreen: outside it the page scrolls the whole document, not
 * `rootRef`'s element, so IntersectionObserver's `root` would have nothing to
 * clip against - callers gate `active` on isFullscreen/isPseudoFullscreen.
 *
 * Returns a 1-indexed page number, defaulting to 1 while inactive, before any
 * pages have reported, or when there's only one page.
 */
export default function useCurrentPage({ active, rootRef, pageRefs, numPages }) {
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!active || numPages <= 1) {
      setCurrentPage(1);
      return;
    }

    const root = rootRef.current;
    const pages = pageRefs.current.filter(Boolean);
    if (!root || pages.length === 0) return;

    // Ratios persist across callback firings so a page that stops reporting
    // (scrolled fully out of the root) doesn't need a synthetic zero entry -
    // the map just keeps its last known value, which the next entry for that
    // page will overwrite anyway.
    const ratios = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => ratios.set(entry.target, entry.intersectionRatio));
        let bestIndex = 0;
        let bestRatio = -1;
        pages.forEach((el, index) => {
          const ratio = ratios.get(el) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIndex = index;
          }
        });
        setCurrentPage(bestIndex + 1);
      },
      { root, threshold: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] }
    );

    pages.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [active, numPages, rootRef, pageRefs]);

  return currentPage;
}
