import fs from 'node:fs';
import path from 'node:path';

/**
 * MEM-27: a page's CSS is its inline <style> blocks plus the same-origin stylesheets it links, in
 * document order (`build.inlineStylesheets: 'auto'` inlines small sheets and links the rest). Every
 * guard that asks what CSS a page ships reads it here, so none goes blind to a linked sheet.
 * Pure: `readSheet(href)` returns a linked sheet's text.
 */
export function pageCssBlocks(html, readSheet) {
  const blocks = [];
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*>/gi)) {
    if (match[1] !== undefined) {
      blocks.push({ href: null, css: match[1] });
      continue;
    }
    const rel = /\brel="([^"]*)"/i.exec(match[0])?.[1] ?? '';
    const href = /\bhref="(\/[^"]+\.css)"/i.exec(match[0])?.[1];
    if (href && rel.split(/\s+/).includes('stylesheet')) blocks.push({ href, css: readSheet(href) });
  }
  return blocks;
}

/** `readSheet` for a built dist folder: the linked file's text, read once per href. */
export function distSheetReader(distDir) {
  const cache = new Map();
  return (href) => {
    if (!cache.has(href)) cache.set(href, fs.readFileSync(path.join(distDir, href), 'utf8'));
    return cache.get(href);
  };
}
