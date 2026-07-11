import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const globalCssPath = path.join(__dirname, '..', 'src', 'styles', 'global.css');

// E2.3.0 temporary inventory. E2.3.5 must reduce this to an empty set and keep
// this script as a no-new-editor-global-CSS guard. Do not add a selector here
// without first assigning it to an E2.3 module in docs/E2.3-editor-css-modules-plan.md.
const allowedEditorClasses = new Set();

const css = fs.readFileSync(globalCssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
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
