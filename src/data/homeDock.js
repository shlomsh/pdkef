// The home dock's order: Shlomi's lead tools first (2026-11-01), then every other listed tool in
// registry order. The registry itself stays in SEO priority for the sitemap and cross-links.
const DOCK_LEAD = ['redact', 'sign', 'highlight-pdf', 'compress', 'merge'];

export function dockOrder(tools) {
  const lead = DOCK_LEAD.flatMap((slug) => tools.filter((tool) => tool.slug === slug));
  return [...lead, ...tools.filter((tool) => !DOCK_LEAD.includes(tool.slug))];
}
