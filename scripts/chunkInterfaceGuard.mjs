// MEM-51: a lazy chunk fetched after a deploy must not bind to the old build's shared chunks.
//
// Chunk names are stable across builds (MEM-25, MEM-31), so a tab left open across a deploy that lazily
// imports `scan-late.js` gets the NEW file, whose `import {..} from "./tools-common.js"` resolves, by URL, to
// the OLD copy the page already evaluated. The minifier renumbers a shared chunk's export letters whenever it
// changes, so every imported name still exists and means something else: no link error, no rejected import,
// wrong functions called (measured: 29 of 29 names imported by scan-late.js from tools-common.js across two
// builds 25 commits apart).
//
// The guard makes that mix fail while the lazy chunk evaluates, before any of its code runs:
//   - every chunk a lazy chunk imports from gains `export const pdkefIface = "<hash>"`;
//   - every lazy chunk starts with `import { pdkefIface } from "<that chunk>"` and a throw on a mismatch.
// <hash> is a function of the chunk's INTERFACE only: its export table, each exported name with the binding
// it exports (read from the rendered chunk before the minifier mangles locals, so a permutation of the same
// letters changes it). A chunk's bytes therefore change when its export table does and not otherwise, which
// keeps MEM-31's update cost; never put a per-deploy or per-commit value here (MEM-19). The page recovers
// through src/site-lib/chunkReload.ts, which treats the failure like a missing chunk.
import { createHash } from 'node:crypto';
import path from 'node:path';

/** The export every guarded chunk carries. chunkReload.ts matches it by name. */
export const GUARD_EXPORT = 'pdkefIface';
/** The message a mismatch throws, before the lazy chunk's file name. chunkReload.ts matches this prefix. */
export const GUARD_ERROR = 'pdkef:chunk-interface-mismatch';

const LOCAL_EXPORT = /^export\s*\{([^}]*)\}\s*(from\b)?/gm;

/**
 * The `name=binding` pairs of a rendered chunk's own export statements (not `export {..} from`), or null when
 * it has none. Pre-minification: rolldown has fixed the exported names but the bindings still carry their
 * source names, which is what makes the pairs a stable description of the interface.
 */
export function exportPairs(code) {
  const pairs = [];
  for (const m of code.matchAll(LOCAL_EXPORT)) {
    if (m[2]) continue;
    for (const part of m[1].split(',')) {
      const [binding, exported = binding] = part.trim().split(/\s+as\s+/);
      if (binding) pairs.push(`${exported}=${binding}`);
    }
  }
  return pairs.length ? pairs.sort() : null;
}

/**
 * A short hash of an export table. Six hex digits: the constant sits in every guarded chunk, /open/'s closure
 * carries three of them against a budget with little room, and a missed mismatch needs a 1 in 16 million collision.
 */
export const interfaceHash = (pairs) => createHash('sha256').update(pairs.join('\n')).digest('hex').slice(0, 6);

/** The chunks no entry reaches by static imports: loaded by a dynamic import, at some later time. */
export function lazyChunkNames(chunks) {
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  const eager = new Set();
  const queue = chunks.filter((c) => c.isEntry).map((c) => c.fileName);
  while (queue.length) {
    const name = queue.pop();
    if (eager.has(name)) continue;
    eager.add(name);
    for (const dep of byName.get(name)?.imports ?? []) queue.push(dep);
  }
  return new Set(chunks.map((c) => c.fileName).filter((name) => !eager.has(name)));
}

/**
 * The guarded import edges: a lazy chunk and each chunk it statically imports that has an interface
 * (`hashes`, by file name). Returns Map<lazy file name, target file names>.
 */
export function guardEdges(chunks, hashes) {
  const lazy = lazyChunkNames(chunks);
  const edges = new Map();
  for (const c of chunks) {
    if (!lazy.has(c.fileName)) continue;
    const targets = c.imports.filter((t) => t !== c.fileName && hashes.has(t));
    if (targets.length) edges.set(c.fileName, targets);
  }
  return edges;
}

/** The specifier one chunk writes for another, as the bundler writes it. */
export function specifier(from, to) {
  const rel = path.posix.relative(path.posix.dirname(from), to);
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** The statements a lazy chunk starts with (ending in a newline), and what a guarded chunk ends with (no trailing newline or semicolon: every byte counts in the precache budget). */
export function guardPrelude(fileName, targets, hashes) {
  const imports = targets.map((t, i) => `import{${GUARD_EXPORT} as _g${i}}from"${specifier(fileName, t)}";`).join('');
  const test = targets.map((t, i) => `_g${i}!=="${hashes.get(t)}"`).join('||');
  return `${imports}if(${test})throw Error("${GUARD_ERROR} ${path.posix.basename(fileName, '.js')}");\n`;
}
export const guardExport = (hash) => `\nexport const ${GUARD_EXPORT}="${hash}"`;

/** Prefixes a source map's mappings with one empty line, matching a line added at the top of its chunk. */
export function shiftMapDown(mapText) {
  const map = JSON.parse(mapText);
  map.mappings = `;${map.mappings}`;
  return JSON.stringify(map);
}

// Per client build: the interface hash of each chunk, recorded as it renders and read when the bundle is complete.
const interfaces = new Map();

export const chunkInterfaceGuard = {
  name: 'pdkef:chunk-interface-guard',
  buildStart() {
    if (this.environment.name === 'client') interfaces.clear();
  },
  renderChunk(code, chunk) {
    if (this.environment.name !== 'client' || !chunk.exports.length) return null;
    const pairs = exportPairs(code);
    // A chunk that only re-exports (an island stub) has no table of its own and is never a guard target.
    if (!pairs) return null;
    const names = pairs.map((p) => p.split('=')[0]).sort();
    const reexported = new Set(chunk.reexports ?? []);
    const own = chunk.exports.filter((n) => !reexported.has(n)).sort();
    if (own.length && names.join() !== own.join()) {
      this.error(`MEM-51: could not read the export table of ${chunk.fileName} (rendered ${names.join(',')}, expected ${own.join(',')})`);
    }
    interfaces.set(chunk.fileName, interfaceHash(pairs));
    return null;
  },
  generateBundle(_options, bundle) {
    if (this.environment.name !== 'client') return;
    const chunks = Object.values(bundle).filter((f) => f.type === 'chunk');
    const edges = guardEdges(chunks, interfaces);
    const guarded = new Set([...edges.values()].flat());
    for (const chunk of chunks) {
      if (guarded.has(chunk.fileName)) chunk.code += guardExport(interfaces.get(chunk.fileName));
      const targets = edges.get(chunk.fileName);
      if (!targets) continue;
      chunk.code = guardPrelude(chunk.fileName, targets, interfaces) + chunk.code;
      const map = bundle[`${chunk.fileName}.map`];
      if (map?.type === 'asset') map.source = shiftMapDown(String(map.source));
    }
  },
};
