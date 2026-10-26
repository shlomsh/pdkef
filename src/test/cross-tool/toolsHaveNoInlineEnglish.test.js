import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
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

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'e2e' || name === 'node_modules') continue;
      out.push(...sourceFiles(path));
    } else if (name.endsWith('.tsx') && !/\.test\.tsx$/.test(name)) {
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
