// QUAL-36: the generic walk behind "which scripts does this npm command run?": every
// `node <file>` in the command text, plus everything those reach through relative or alias imports,
// transitively. Shared by affected-scope.mjs (the build pipeline, QUAL-32) and check-push.mjs
// (the dist guards). `readFile(rel)` returns the text or null/undefined when the file is absent.
import { dirname, join } from 'node:path';
import { importSpecifiers } from './import-graph.mjs';
import { aliasTarget } from './import-aliases.mjs';

export function scriptClosure(commandText, readFile) {
  const found = new Set();
  const queue = [...commandText.matchAll(/\bnode\s+((?:\.\/)?[\w./-]+\.[cm]?[jt]s)\b/g)].map((m) => m[1].replace(/^\.\//, ''));
  const resolve = (from, spec) => {
    const base = (aliasTarget(spec) ?? join(dirname(from), spec)).split('\\').join('/');
    const stem = base.replace(/\.[cm]?[jt]sx?$/, '');
    const candidates = [base, ...['.mjs', '.js', '.ts', '.tsx', '.jsx'].flatMap((e) => [stem + e, base + e, `${base}/index${e}`])];
    return candidates.find((c) => readFile(c) != null) ?? null;
  };
  while (queue.length > 0) {
    const file = queue.pop();
    if (found.has(file)) continue;
    const source = readFile(file);
    if (source == null) continue;
    found.add(file);
    for (const spec of importSpecifiers(source, file)) {
      if (!spec.startsWith('.') && !aliasTarget(spec)) continue;
      const target = resolve(file, spec);
      if (target) queue.push(target);
    }
  }
  return found;
}
