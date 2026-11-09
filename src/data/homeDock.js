// The home dock's order: Shlomi's lead tools first (2026-11-01; Scan joined after Merge on
// 2026-11-03), then every other listed tool in registry order. The registry itself stays in SEO
// priority for the sitemap and cross-links.
const DOCK_LEAD = ['redact', 'sign', 'highlight-pdf', 'compress', 'merge', 'scan-to-pdf'];

export function dockOrder(tools) {
  const lead = DOCK_LEAD.flatMap((slug) => tools.filter((tool) => tool.slug === slug));
  return [...lead, ...tools.filter((tool) => !DOCK_LEAD.includes(tool.slug))];
}

// The variant landing pages (Rotate, Extract pages, ...) under the listed tool they open, in the
// dock's order, so the home page can link every one without giving them dock cards of their own.
export function variantGroups(tools) {
  return dockOrder(tools.filter((tool) => !tool.variantOf))
    .map((parent) => ({ parent, variants: tools.filter((tool) => tool.variantOf === parent.slug) }))
    .filter((group) => group.variants.length > 0);
}
