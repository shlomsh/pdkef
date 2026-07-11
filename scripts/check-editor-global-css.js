import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const globalCssPath = path.join(__dirname, '..', 'src', 'styles', 'global.css');

// A ratchet, not an inventory: every editor surface (Sign, Redact, and any
// future tool built on src/editor/) must keep 0 of its own classes in the
// global stylesheet. E2.3/E2.4 already emptied Sign's and Redact's; this set
// must stay empty. Do not add a selector here - move it into the owning
// component's CSS Module instead (see ARCHITECTURE.md §3.1's styling
// boundary and CLAUDE.md's "Styling direction" section).
const allowedEditorClasses = new Set();

const css = fs.readFileSync(globalCssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const foundEditorClasses = new Set(
  [...css.matchAll(/\.(?:sign|sig|redact|editor|el)-[A-Za-z0-9_-]+/g)].map(([selector]) => selector.slice(1)),
);

const unexpected = [...foundEditorClasses].filter((className) => !allowedEditorClasses.has(className));
const missing = [...allowedEditorClasses].filter((className) => !foundEditorClasses.has(className));

if (unexpected.length > 0 || missing.length > 0) {
  console.error('Editor global CSS ratchet tripped: a sign/sig/redact/editor/el class reappeared in global.css.');
  console.error('Move it into the owning component\'s CSS Module instead of adding it to the allowlist.');
  if (unexpected.length > 0) console.error(`Unexpected: ${unexpected.join(', ')}`);
  if (missing.length > 0) console.error(`Missing: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`Editor global CSS inventory is unchanged (${foundEditorClasses.size} classes).`);
