import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// ARCH-35: a tool's user-facing English lives in src/tools/<tool>/messages.ts, never in its
// components. This reads every non-test .tsx under src/tools/ and fails on a string a person
// would read or hear: JSX text, a string in a JSX expression child, an aria-label / title /
// placeholder / alt attribute, and the argument of an announce call. Something that cannot move
// (a brand name, a unit, a file extension) goes in ALLOWED with the reason it stays.
//
// A string counts only if it holds two letters in a row after HTML entities (&ldquo;) are dropped;
// icons, "·" and "×" are not text.

/** file (relative to src/tools) -> strings that stay in the component, each with the reason. */
const ALLOWED = {
  'compress/components/LevelPicker.tsx': {
    KB: 'a file-size unit, the same in every language the app speaks',
    MB: 'a file-size unit, the same in every language the app speaks',
  },
  'sign/components/DraggableWrapper.tsx': {
    Aa: 'a specimen of type on the formatting button, not a word',
  },
  'sign/components/FontPickerMenu.tsx': {
    Aa: 'a specimen of type on the font button, not a word',
  },
  'sign/components/ThicknessPickerMenu.tsx': {
    'px thickness': 'a tooltip built from a number; Sign\'s catalogue is in the SNG freeze, so it moves with that text change',
  },
};

const toolsDir = fileURLToPath(new URL('../../tools', import.meta.url));
const ANNOUNCERS = new Set(['setAnnouncement', 'announce']);
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt']);

function sourceFiles(dir, ext = '.tsx') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'e2e' || name === 'node_modules') continue;
      out.push(...sourceFiles(path, ext));
    } else if (name.endsWith(ext) && !name.endsWith(`.test${ext}`)) {
      out.push(path);
    }
  }
  return out;
}

/** The string literals an expression can render directly: through ?:, &&, ||, ??, parentheses and templates. */
function literalsOf(node, out = []) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  else if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) out.push(span.literal.text);
  } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) literalsOf(node.expression, out);
  else if (ts.isConditionalExpression(node)) {
    literalsOf(node.whenTrue, out);
    literalsOf(node.whenFalse, out);
  } else if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      literalsOf(node.right, out);
      if (op !== ts.SyntaxKind.AmpersandAmpersandToken) literalsOf(node.left, out);
    }
  }
  return out;
}

export function findInlineEnglish(source) {
  const file = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    if (ts.isJsxText(node)) found.push(node.text);
    else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) literalsOf(node.expression, found);
    else if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(file)) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) found.push(node.initializer.text);
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) literalsOf(node.initializer.expression, found);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ANNOUNCERS.has(node.expression.text)) {
      for (const arg of node.arguments) literalsOf(arg, found);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found.map((text) => text.replace(/\s+/g, ' ').trim()).map((text) => text.replace(/&\w+;/g, '').trim()).filter((text) => /[A-Za-z]{2}/.test(text));
}

// Plain .ts modules (copy builders, state, hooks). The rule: a string literal or template piece
// that holds two words of letters separated by a space is a sentence a person might read. It is
// skipped where it is code: import/export specifiers, type literals, property names, case labels,
// comparisons, console.* and reportError arguments (log lines and error-report labels). The named
// copy modules are stricter: they hold words only, so one word ("Title") counts too.
/** Plain .ts files whose multi-word strings are not UI text, each with the reason. */
const TS_NOT_UI = {
  'redact/hooks/useFind.ts': 'a canvas font shorthand used to measure glyphs',
  'scan/lib/edges/corpus.ts': 'names of edge-detection fixtures, shown only in test output',
  'sign/hooks/useFormFieldRegions.ts': 'developer diagnostics sent to the error report, not shown to a person',
};
const COPY_MODULES = new Set(['redact/lib/check/checkCopy.ts', 'redact/lib/details/describeDetails.ts']);
const SENTENCE = /[A-Za-z]{2,} (?:\{\} )*[A-Za-z]{2,}/;
const CAPITAL_WORD = /^[A-Z][a-z]{2,}/;
const LOGGERS = new Set(['reportError']);

function isCodeLiteral(node) {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isCaseClause(parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind)) return true;
  for (let up = parent; up; up = up.parent) {
    if (!ts.isCallExpression(up)) continue;
    const callee = up.expression;
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'console') return true;
    if (ts.isIdentifier(callee) && LOGGERS.has(callee.text)) return true;
  }
  for (let up = parent; up; up = up.parent) if (ts.isNewExpression(up) && ts.isIdentifier(up.expression) && up.expression.text.endsWith('Error')) return true;
  return false;
}

export function findInlineEnglishInTs(source, strict = false) {
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = [];
  const rule = { test: (text) => SENTENCE.test(text) || (strict && CAPITAL_WORD.test(text)) };
  const take = (node, text) => {
    const one = text.replace(/\s+/g, ' ').trim();
    if (rule.test(one) && !isCodeLiteral(node)) found.push(one);
  };
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) take(node, node.text);
    else if (ts.isTemplateExpression(node)) {
      // The pieces read together, holes as {}: `Page ${n} done` is one sentence.
      take(node, [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('{}'));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('findInlineEnglishInTs', () => {
  it('sees sentences and skips code', () => {
    const found = findInlineEnglishInTs(`
      import x from './a b';
      type T = 'one two';
      const a = { 'key one': 1, label: 'Saved again', tpl: \`Page \${n} done\` };
      if (k === 'two words') {}
      console.error('Could not read this');
      reportError('redact', 'load the file');
      const cls = 'row';`);
    expect(found).toEqual(['Saved again', 'Page {} done']);
  });

  it('counts a single word in a copy module', () => {
    expect(findInlineEnglishInTs(`const a = { label: 'Title' }; const b = 'x';`, true)).toEqual(['Title']);
  });
});

describe('findInlineEnglish', () => {
  it('sees text nodes, text attributes, branches and announcements, and skips code', () => {
    const found = findInlineEnglish(`
      const a = <button aria-label="Close it" class="x" onClick={f}>Save {n} {ok ? 'Yes' : 'No'} {v}</button>;
      const b = <input placeholder={\`Type here\`} type="password" />;
      announce('Done.'); setAnnouncement(\`Moved \${n}\`); other('Not text');
      const c = <i>·</i>;`);
    expect(found).toEqual(['Close it', 'Save', 'Yes', 'No', 'Type here', 'Done.', 'Moved']);
  });
});

describe('tool components carry no inline English', () => {
  const files = sourceFiles(toolsDir);

  it('finds the tool components', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('keeps every user-facing string in the tool\'s messages.ts', () => {
    const offenders = [];
    for (const path of files) {
      const rel = relative(toolsDir, path);
      const allowed = ALLOWED[rel] ?? {};
      for (const text of findInlineEnglish(readFileSync(path, 'utf8'))) {
        if (!(text in allowed)) offenders.push(`${rel}: ${JSON.stringify(text)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('allows only strings that are still in the file', () => {
    const stale = [];
    for (const [rel, entries] of Object.entries(ALLOWED)) {
      const found = findInlineEnglish(readFileSync(join(toolsDir, rel), 'utf8'));
      for (const text of Object.keys(entries)) if (!found.includes(text)) stale.push(`${rel}: ${JSON.stringify(text)}`);
    }
    expect(stale).toEqual([]);
  });
});

describe('tool .ts modules carry no inline English', () => {
  const files = sourceFiles(toolsDir, '.ts');

  it('keeps every sentence in the tool\'s messages.ts', () => {
    const offenders = [];
    for (const path of files) {
      const rel = relative(toolsDir, path);
      if (basename(path) === 'messages.ts' || rel in TS_NOT_UI) continue;
      for (const text of findInlineEnglishInTs(readFileSync(path, 'utf8'), COPY_MODULES.has(rel))) offenders.push(`${rel}: ${JSON.stringify(text)}`);
    }
    expect(offenders).toEqual([]);
  });

  it('lists only files that exist', () => {
    const rels = files.map((f) => relative(toolsDir, f));
    for (const rel of Object.keys(TS_NOT_UI)) expect(rels).toContain(rel);
  });

  it('names copy modules that exist', () => {
    for (const rel of COPY_MODULES) expect(files.map((f) => relative(toolsDir, f))).toContain(rel);
  });
});
