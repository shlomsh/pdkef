---
id: "SEO-60"
title: "Tool-page section headings say something, and guide cards sit on the page grid"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "now"
depends_on: ["SEO-58"]
---

# SEO-60 · Section headings that say something

The rating board's heading and spacing were fixed in SEO-58. A survey of the rest of the site (2026-11-06) found the same
two problems in shared tool-page sections: headings that name the section instead of saying anything, and guide cards
tighter than the grid below them.

## What changes

- "Documentation" becomes "Step-by-step guides for this tool".
- "More PDF tools" becomes "More free PDF tools that run in your browser".
- "Free for everyone" becomes "Free, no signup, and your file never leaves your device".
- The FAQ heading names the tool, on tool pages and on guides that hang off one. The home page and any guide with no tool
  say "Questions about these free PDF tools".
- Guide cards use the same gap and columns as "More PDF tools". A short row stays centred, so a lone card does not pin left.
- Localized guides pass their locale to the cross-links, which were showing English.

## Done when

- Production `/compress/` shows all four headings, and its first row of guide cards lines up with the cross-link grid.
- `/he/` tool pages and guides show the Hebrew strings (Shlomi reads them).
- Whether these move search results is unmeasured; read with the other search numbers.
