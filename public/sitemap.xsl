<?xml version="1.0" encoding="UTF-8"?>
<!--
  Browser-only pretty-print for /sitemap.xml. Search engines parse the XML
  directly and ignore this PI entirely - it exists because any <xhtml:link>
  element (used here for hreflang alternates, standard per sitemaps.org) makes
  Chrome treat the document as containing real HTML and skip its usual "no
  style information" debug tree view, instead flattening every element's text
  into one unstyled run. See CLAUDE.md's "sitemap.xml browser rendering"
  note before touching this file or the xml-stylesheet PI in sitemap.xml.js.
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/sitemap:urlset">
<html>
<head>
<title>Sitemap - pdkef.com</title>
<meta name="robots" content="noindex"/>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f9fa; color: #23404a; margin: 0; padding: 2rem; }
  h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
  p.count { color: #4a6570; margin: 0 0 1.5rem; }
  table { width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(35, 64, 74, 0.1); }
  th { text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; color: #4a6570; background: #eef6f8; padding: 0.6rem 0.9rem; }
  td { padding: 0.6rem 0.9rem; border-top: 1px solid #e6f1f3; vertical-align: top; font-size: 0.9rem; }
  a { color: #397281; }
  .alternates { margin-top: 0.25rem; font-size: 0.8rem; color: #4a6570; }
  .alternates a { margin-right: 0.6rem; }
  .meta-col { white-space: nowrap; color: #4a6570; }
</style>
</head>
<body>
<h1>XML Sitemap</h1>
<p class="count"><xsl:value-of select="count(sitemap:url)"/> URLs. This file is generated for search engines; <a href="/">visit pdkef.com</a>.</p>
<table>
<tr>
  <th>URL</th>
  <th>Last modified</th>
  <th>Change freq.</th>
  <th>Priority</th>
</tr>
<xsl:for-each select="sitemap:url">
<tr>
  <td>
    <a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a>
    <xsl:if test="xhtml:link">
      <div class="alternates">
        <xsl:for-each select="xhtml:link">
          <a href="{@href}">[<xsl:value-of select="@hreflang"/>]</a>
        </xsl:for-each>
      </div>
    </xsl:if>
  </td>
  <td class="meta-col"><xsl:value-of select="sitemap:lastmod"/></td>
  <td class="meta-col"><xsl:value-of select="sitemap:changefreq"/></td>
  <td class="meta-col"><xsl:value-of select="sitemap:priority"/></td>
</tr>
</xsl:for-each>
</table>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
