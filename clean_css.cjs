const fs = require('fs');

let css = fs.readFileSync('src/styles/global.css', 'utf-8');

// The classes to target
const targets = [
  '.sign-workspace',
  '.sign-pages-container',
  '.sign-page-wrapper',
  '.sign-page-canvas',
  '.sign-page-overlay',
  '.sign-element',
  '.sign-element-actions',
  '.sign-tool-btn',
  '.sign-popover',
  '.sign-color-menu',
  '.sign-font-menu',
  '.sign-menu-item',
  '.sign-thickness-item',
  '.sign-dropdown-item',
  '.sign-dropdown-list',
  '.sign-font-menu-item',
  '.sign-font-menu-group-label',
  '.sign-color-trigger',
  '.sign-color-trigger-swatch',
  '.sign-color-picker',
  '.sign-color-swatch',
  '.sign-text-display',
  '.sign-text-input',
  '.sign-text-measure',
  '.sign-sig-image'
];

// Build a regex to match blocks that start with any of the target classes
// This is a naive CSS parser that looks for "selector { properties }"
// We match the selector part containing our target classes.

// A better way is to use a CSS parser, but we can do it with regex carefully.
// Let's match: selector { ... }
let regex = /([^{}]*?)\{([^{}]*?)\}/g;

let newCss = css.replace(regex, (match, selector, content) => {
  // Check if selector includes any target
  const hasTarget = targets.some(t => selector.includes(t));
  if (hasTarget) {
    // We keep CSS custom properties (--var: value;) and remove the rest
    const lines = content.split('\n');
    const keepLines = lines.filter(line => line.trim().startsWith('--') || line.trim() === '');
    
    // If we kept some custom properties, we recreate the block
    const validLines = keepLines.filter(l => l.trim() !== '');
    if (validLines.length > 0) {
      return `${selector}{${validLines.join('\n')}\n}`;
    } else {
      // Remove block completely
      return '';
    }
  }
  return match;
});

// Also clean up leftover media queries that might be empty or comments that are orphaned
newCss = newCss.replace(/@media[^{]+\{\s*\}/g, '');
// Clean up multiple empty lines
newCss = newCss.replace(/\n\s*\n/g, '\n\n');

fs.writeFileSync('src/styles/global.css', newCss, 'utf-8');
console.log('Done cleaning css');
