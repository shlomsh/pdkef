import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const globalCssPath = path.join(__dirname, '..', 'src', 'styles', 'global.css');

// E2.3.0 temporary inventory. E2.3.5 must reduce this to an empty set and keep
// this script as a no-new-editor-global-CSS guard. Do not add a selector here
// without first assigning it to an E2.3 module in docs/E2.3-editor-css-modules-plan.md.
const allowedEditorClasses = new Set([
  'sig-btn', 'sig-btn-danger', 'sig-btn-primary', 'sig-btn-secondary', 'sig-btn-success',
  'sig-canvas', 'sig-clear-btn', 'sig-confirm-text', 'sig-dialog', 'sig-dialog--narrow',
  'sig-dialog-body', 'sig-dialog-body--list', 'sig-dialog-body--tight', 'sig-dialog-close',
  'sig-dialog-footer', 'sig-dialog-header', 'sig-pad-wrapper', 'sig-pen-controls', 'sig-tab-btn',
  'sig-tabs', 'sig-thickness-control', 'sig-type-container', 'sig-type-input', 'sig-type-preview',
  'sig-upload-container', 'sig-upload-dropzone', 'sig-upload-options', 'sig-upload-preview',
  'sign-color-divider', 'sign-color-input', 'sign-color-menu', 'sign-color-picker',
  'sign-color-swatch', 'sign-color-trigger', 'sign-color-trigger-swatch', 'sign-dropdown-add-btn',
  'sign-dropdown-item', 'sign-dropdown-item-delete', 'sign-dropdown-list', 'sign-dropdown-list--clean',
  'sign-dropdown-menu', 'sign-element', 'sign-element--line', 'sign-element--shape',
  'sign-element--symbol', 'sign-element-actions', 'sign-element-btn', 'sign-element-btn-danger',
  'sign-element-resizer', 'sign-export-actions', 'sign-export-share', 'sign-font-menu',
  'sign-font-menu-group-label', 'sign-font-menu-item', 'sign-font-trigger', 'sign-help-tip',
  'sign-menu-item', 'sign-page-canvas', 'sign-page-overlay', 'sign-page-wrapper',
  'sign-pages-container', 'sign-popover', 'sign-sig-image', 'sign-text-display', 'sign-text-input',
  'sign-text-measure', 'sign-thickness-item', 'sign-tool-btn', 'sign-tool-btn-desktop-download',
  'sign-tool-btn-download', 'sign-tool-btn-reset', 'sign-tool-btn-share', 'sign-tool-btn-text',
  'sign-tool-dropdown-container', 'sign-toolbar', 'sign-toolbar-container', 'sign-toolbar-divider',
  'sign-workspace',
]);

const css = fs.readFileSync(globalCssPath, 'utf8');
const foundEditorClasses = new Set(
  [...css.matchAll(/\.(?:sign|sig)-[A-Za-z0-9_-]+/g)].map(([selector]) => selector.slice(1)),
);

const unexpected = [...foundEditorClasses].filter((className) => !allowedEditorClasses.has(className));
const missing = [...allowedEditorClasses].filter((className) => !foundEditorClasses.has(className));

if (unexpected.length > 0 || missing.length > 0) {
  console.error('E2.3 global editor CSS inventory changed. Update the ownership plan before changing this guard.');
  if (unexpected.length > 0) console.error(`Unexpected: ${unexpected.join(', ')}`);
  if (missing.length > 0) console.error(`Missing: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`Editor global CSS inventory is unchanged (${foundEditorClasses.size} classes).`);
