---
id: "SEO-50"
title: "The browser view of /sitemap.xml stops depending on XSLT"
status: "in_progress"
priority: "P3"
epic: "search-and-languages"
horizon: "now"
---

# SEO-50 · The browser view of /sitemap.xml stops depending on XSLT

## Problem

Chrome shows "This site uses XSLT; that functionality is being removed from this browser very soon" on
`/sitemap.xml`, because `src/pages/sitemap.xml.js` points an `<?xml-stylesheet type="text/xsl"?>` PI at
`public/sitemap.xsl`. The stylesheet only pretty-prints the file for a person who opens the URL; search engines
ignore the PI. Once Chrome drops XSLT the view falls back to one flattened run of text (the `xhtml:link` hreflang
alternates stop Chrome's default tree view).

## Decision

Style the XML with a plain CSS stylesheet, `public/sitemap.css` (`type="text/css"`), and delete `sitemap.xsl`.
CSS cannot build a table or turn an attribute into a link, so each URL is a block with its date, change
frequency and priority beside it, and the hreflang alternates are shown as text. The XML itself is unchanged.

## Done when

- `/sitemap.xml` carries the CSS PI, no XSLT, and renders readably in Chrome.
- `public/sitemap.xsl` is gone and `.claude/rules/styling.md` names `sitemap.css`.
