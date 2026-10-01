// Build-time only. The two components that emit their CSS as
// `<style is:inline set:html>` (CompareFigure.astro and TheO.astro, so only the
// pages that render them carry it) and the CSP hash each page needs for it.
//
// Astro hashes only the styles it bundles itself, so these are registered by
// hand with `Astro.csp.insertStyleHash`. Since astro 7.3.3 (#17857, the render
// performance work) the page's CSP <meta> is written when its <head> is, before
// any component lower in the page has run, so a component can no longer hash
// its own style: the hash is registered by the route or layout that owns the
// <head>, from the text this module hands both sides. `npm run test:csp` names
// any page whose inline style has no hash.
import compareFigureCss from '../components/compareFigure.css?inline';
import theOCss from '../components/theO.css?inline';
import { cspSha256 } from './cspHash.js';
import { theOTimelineCss } from './theOTimeline';

/** What CompareFigure.astro emits: ?inline, so the build minifies it and the hash covers the shipped text. */
export const compareFigureStyle = compareFigureCss;

/** What TheO.astro emits: the static rules plus the pacing-derived keyframes. */
export const theOStyle = theOCss + theOTimelineCss();

// The slice of `Astro.csp` this needs; it is undefined without the CSP feature on.
type StyleHashSink = { insertStyleHash: (hash: `sha256-${string}`) => void } | undefined;

export function registerInlineStyle(csp: StyleHashSink, css: string): void {
  csp?.insertStyleHash(cspSha256(css));
}

/** A documentation page that renders a CompareFigure carries compareFigureStyle. */
export function registerContentPageStyles(
  csp: StyleHashSink,
  entry: { data: { sections: { blocks: { kind: string }[] }[] } },
): void {
  const hasFigure = entry.data.sections.some((section) => section.blocks.some((block) => block.kind === 'compareFigure'));
  if (hasFigure) registerInlineStyle(csp, compareFigureStyle);
}
