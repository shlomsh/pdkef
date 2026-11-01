import { useEffect, useMemo } from 'preact/hooks';
import { pageSizes } from '../lib/print/pageSizes.ts';

/**
 * READ-06: the paper is the page. While the sheets are mounted, each prints on paper of its own size, so the
 * browser adds no margin of its own. A constructed sheet, not a <style> element, so the CSP's style-src has
 * nothing to refuse. Returns the named @page for each sheet.
 */
export function usePrintPaper(pages: readonly { width: number; height: number }[]): string[] {
  const paper = useMemo(() => pageSizes(pages), [pages]);
  useEffect(() => {
    if (paper.rules.length === 0 || typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in document)) return undefined;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(paper.rules.join('\n'));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet); };
  }, [paper]);
  return paper.names;
}
