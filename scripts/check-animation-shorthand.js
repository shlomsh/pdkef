import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');

/*
 * Guards against a build-time trap in the `animation` shorthand: Lightning CSS
 * (Vite's minifier) folds a rule's `animation-timeline` longhand into the
 * shorthand when both are declared in the same rule, e.g. source
 * `animation: try-cue step-start both; animation-timeline: --try-card;`
 * minified to `animation:step-start both try-cue --try-card`. Chrome and
 * Safari reject a timeline value inside the shorthand and drop the whole
 * declaration, so the scroll-driven animation silently never runs at all -
 * this shipped to pdkef.com once this way (fixed in e7bb435a), and nothing
 * caught it before the deploy.
 *
 * The fix is always the same: write the animation as longhands instead of the
 * shorthand in that rule (animation-name, animation-duration: auto,
 * animation-timing-function, animation-fill-mode, animation-timeline,
 * animation-range), so the minifier has nothing to fold together.
 *
 * This scans the BUILT output - every dist/**\/*.html file's inline <style>
 * blocks, and every dist/**\/*.css file - rather than source, because the
 * trap is a minifier transform: source can read correctly and still ship
 * broken.
 */

// Removes every balanced `name(...)` call from text. Used to strip var(...)
// references before scanning for a bare dashed ident or a view()/scroll()
// call, so `animation:var(--try-land,none)` (a custom property carrying the
// whole shorthand, resolved before the browser ever sees a timeline function)
// does not trip the same check meant for a timeline written directly into the
// shorthand's own value.
function stripFunctionCalls(text, name) {
  const needle = `${name}(`;
  let out = '';
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(needle, i);
    if (idx === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, idx);
    let depth = 1;
    let j = idx + needle.length;
    while (j < text.length && depth > 0) {
      if (text[j] === '(') depth++;
      else if (text[j] === ')') depth--;
      j++;
    }
    i = j;
  }
  return out;
}

// Matches only the `animation` shorthand property, never a longhand like
// `animation-name:` or `animation-timeline:` - the lookbehind rejects a
// preceding word/hyphen character, and the colon must follow "animation"
// with only whitespace between, which a longhand's own trailing `-word`
// never allows.
const SHORTHAND_PATTERN = /(?<![\w-])animation\s*:\s*([^;{}]+)/gi;

/**
 * Given raw CSS (or the contents of an inline <style> block), returns the
 * offending `animation:` declarations - each rendered as `animation:<value>`
 * - that hide a scroll/view timeline inside the shorthand: a dashed ident
 * (`--foo`) that is not inside a var(...) call, or a `view(`/`scroll(`
 * function. A `var(--x)` reference on its own is fine.
 */
export function findAnimationShorthandViolations(cssText) {
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations = [];
  let match;
  SHORTHAND_PATTERN.lastIndex = 0;
  while ((match = SHORTHAND_PATTERN.exec(stripped)) !== null) {
    const value = match[1].trim();
    const withoutVarCalls = stripFunctionCalls(value, 'var');
    const hasBareDashedIdent = /(^|[\s,(])--[A-Za-z0-9_-]+/.test(withoutVarCalls);
    const hasTimelineFunction = /\b(view|scroll)\(/i.test(withoutVarCalls);
    if (hasBareDashedIdent || hasTimelineFunction) {
      violations.push(`animation:${value}`);
    }
  }
  return violations;
}

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function main() {
  if (!fs.existsSync(distDir)) {
    console.error(`dist directory not found: ${distDir}. Run npm run build first.`);
    process.exit(1);
  }

  const htmlFiles = walk(distDir, (f) => f.endsWith('.html'));
  const cssFiles = walk(distDir, (f) => f.endsWith('.css'));

  let failures = 0;

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    for (const block of styleBlocks) {
      for (const violation of findAnimationShorthandViolations(block)) {
        console.error(`${path.relative(process.cwd(), file)}: ${violation}`);
        failures++;
      }
    }
  }

  for (const file of cssFiles) {
    const css = fs.readFileSync(file, 'utf8');
    for (const violation of findAnimationShorthandViolations(css)) {
      console.error(`${path.relative(process.cwd(), file)}: ${violation}`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(
      'Write the animation as longhands (animation-name, animation-duration: auto, animation-timing-function, animation-fill-mode, animation-timeline, animation-range) in the same rule instead of the shorthand.',
    );
    process.exit(1);
  }

  console.log('No scroll/view timeline folded into an animation shorthand.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
