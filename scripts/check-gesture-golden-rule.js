import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E7.8(a) - static guard for the gesture golden rule (ARCHITECTURE §1.2/§4):
// mutate the DOM during a gesture, commit application state exactly once on
// release. `src/editor/gestures/controller.ts`'s `computePatch` is the single
// choke point every drag/resize/create gesture in Sign and Redact routes
// through on every pointermove/touchmove - it must only *compute* a patch,
// never dispatch it. This is a regression guard, not a parser: it uses brace
// counting rather than a real AST, matching every `computePatch` call site
// in the repo as of E4/E4.4.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');

const FORBIDDEN = [
  { name: 'onChange(', pattern: /\bonChange\s*\(/g },
  { name: 'dispatch(', pattern: /\bdispatch\s*\(/g },
  { name: 'setState(', pattern: /\bsetState\s*\(/g },
];

function collectSourceFiles(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, fileList);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// Given `source` and the index of an opening `{`, returns the matching
// closing brace's index using naive depth counting. Good enough for this
// codebase's gesture handlers (verified against every current call site);
// not a substitute for a real parser.
function findMatchingBraceEnd(source, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Extracts the block-body text of the function assigned to `computePatch`,
// starting the scan just after the `computePatch:` key. Handles both an
// inline arrow function and a bare identifier referencing a function/const
// defined elsewhere in the same file.
function extractComputePatchBody(source, afterColonIndex) {
  const rest = source.slice(afterColonIndex);
  const trimmed = rest.replace(/^\s*/, '');
  const leadingWs = rest.length - trimmed.length;
  const valueStart = afterColonIndex + leadingWs;

  const asyncMatch = /^async\s+/.exec(trimmed);
  const scanFrom = asyncMatch ? valueStart + asyncMatch[0].length : valueStart;

  if (source[scanFrom] === '(') {
    // (params) => { ... }
    let depth = 0;
    let i = scanFrom;
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    const arrowMatch = /^\s*=>\s*\{/.exec(source.slice(i));
    if (!arrowMatch) return null;
    const braceIndex = i + arrowMatch[0].length - 1;
    const endIndex = findMatchingBraceEnd(source, braceIndex);
    if (endIndex === -1) return null;
    return source.slice(braceIndex, endIndex + 1);
  }

  // Single-arg arrow with no parens: `computePatch: moveEvent => { ... }`.
  const identMatch = /^([A-Za-z_$][A-Za-z0-9_$]*)/.exec(source.slice(scanFrom));
  if (!identMatch) return null;
  const ident = identMatch[1];
  const afterIdent = source.slice(scanFrom + ident.length);
  const bareArrow = /^\s*=>\s*\{/.exec(afterIdent);
  if (!bareArrow) return null;
  const braceIndex = scanFrom + ident.length + bareArrow[0].length - 1;
  const endIndex = findMatchingBraceEnd(source, braceIndex);
  if (endIndex === -1) return null;
  return source.slice(braceIndex, endIndex + 1);
}

// Cleaner reference resolver: given the definition match's own opening
// paren/identifier position, walk forward the same way a fresh
// `computePatch:` scan would.
function extractNamedFunctionBody(source, defMatch, ident) {
  const isFunctionDecl = defMatch[0].trim().startsWith('function');
  if (isFunctionDecl) {
    const parenIndex = source.indexOf('(', defMatch.index);
    let depth = 0;
    let i = parenIndex;
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    const braceMatch = /^\s*\{/.exec(source.slice(i));
    if (!braceMatch) return null;
    const braceIndex = i + braceMatch[0].length - 1;
    const endIndex = findMatchingBraceEnd(source, braceIndex);
    if (endIndex === -1) return null;
    return source.slice(braceIndex, endIndex + 1);
  }

  // const/let/var IDENT = ... — reuse the same colon-relative scanner by
  // pretending the `=` is the "colon".
  const eqIndex = source.indexOf('=', defMatch.index);
  return extractComputePatchBody(source, eqIndex + 1);
}

function findComputePatchBodies(source) {
  const bodies = [];
  const keyRegex = /computePatch\s*:/g;
  let match;
  while ((match = keyRegex.exec(source)) !== null) {
    const afterColonIndex = match.index + match[0].length;
    const rest = source.slice(afterColonIndex);
    const trimmed = rest.replace(/^\s*/, '');
    const leadingWs = rest.length - trimmed.length;
    const valueStart = afterColonIndex + leadingWs;

    if (source[valueStart] === '(' || /^async\s*\(/.test(trimmed)) {
      const body = extractComputePatchBody(source, afterColonIndex);
      if (body) bodies.push(body);
      continue;
    }

    const identMatch = /^([A-Za-z_$][A-Za-z0-9_$]*)/.exec(trimmed);
    if (!identMatch) continue;
    const ident = identMatch[1];
    const afterIdent = trimmed.slice(ident.length);

    if (/^\s*=>\s*\{/.test(afterIdent)) {
      const body = extractComputePatchBody(source, afterColonIndex);
      if (body) bodies.push(body);
      continue;
    }

    // Bare reference: resolve the identifier's own definition.
    const defRegex = new RegExp(
      `(?:(?:const|let|var)\\s+${ident}\\s*=\\s*(?:async\\s*)?\\(|function\\s+${ident}\\s*\\()`,
    );
    const defMatch = defRegex.exec(source);
    if (!defMatch) continue;
    const body = extractNamedFunctionBody(source, defMatch, ident);
    if (body) bodies.push(body);
  }
  return bodies;
}

let violations = [];
for (const file of collectSourceFiles(srcDir)) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('computePatch')) continue;

  const bodies = findComputePatchBodies(source);
  for (const body of bodies) {
    for (const { name, pattern } of FORBIDDEN) {
      pattern.lastIndex = 0;
      if (pattern.test(body)) {
        violations.push({ file: path.relative(process.cwd(), file), call: name });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Gesture golden-rule violation: a computePatch body calls state-committing code directly.');
  console.error('computePatch must only compute and return a patch; commit exactly once via the `commit` callback on release.');
  for (const { file, call } of violations) {
    console.error(`  ${file}: found ${call} inside a computePatch body`);
  }
  process.exit(1);
}

console.log('Gesture golden-rule guard passed: no computePatch body calls onChange/dispatch/setState directly.');
