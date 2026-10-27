import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSourceFiles, relOf, edgesOfFiles } from './import-graph.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// --- project cycles (ARCH-42): the Nx project graph must stay acyclic --------
// Owning project of a file = the nearest ancestor directory holding a project.json (its `name`).
// A cycle between projects makes every affected run reach everything again (ARCH-34), so any
// strongly connected component of more than one project fails. Test files are scanned too: Nx
// counts their imports as edges.
const PROJECT_SCAN_ROOTS = ['src', 'e2e', 'scripts', 'api', 'public', 'middleware.ts'];

// dir (repo-relative, '' for the root) -> project name, from every project.json under the roots.
export function loadProjectOwners(root = ROOT) {
  const owners = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
      if (entry.name !== 'project.json') continue;
      const { name } = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (name) owners.set(relOf(dir, root), name);
    }
  };
  for (const r of PROJECT_SCAN_ROOTS) {
    const abs = path.join(root, r);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walk(abs);
  }
  return owners;
}

// project name -> its string `implicitDependencies` (Nx draws an edge for each). `!` exclusions and
// glob entries are skipped: they cannot name a project.
export function loadImplicitDependencies(root = ROOT) {
  const implicit = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
      if (entry.name !== 'project.json') continue;
      const { name, implicitDependencies } = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (!name || !Array.isArray(implicitDependencies)) continue;
      const deps = implicitDependencies.filter((d) => typeof d === 'string' && !d.startsWith('!') && !/[*?{]/.test(d));
      implicit.set(name, [...(implicit.get(name) || []), ...deps]);
    }
  };
  for (const r of PROJECT_SCAN_ROOTS) {
    const abs = path.join(root, r);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walk(abs);
  }
  return implicit;
}

// Adds project -> dependency for each implicit dependency naming a known project (unknown: ignored).
export function withImplicitEdges(graph, implicit, knownProjects) {
  const known = new Set(knownProjects);
  for (const [project, deps] of implicit) {
    for (const dep of deps) {
      if (!known.has(project) || !known.has(dep) || dep === project) continue;
      if (!graph.has(project)) graph.set(project, new Set());
      graph.get(project).add(dep);
    }
  }
  return graph;
}

export function projectOf(relPath, owners) {
  let dir = path.posix.dirname(relPath);
  for (;;) {
    if (owners.has(dir)) return owners.get(dir);
    if (dir === '.' || dir === '') return owners.get('') ?? null;
    dir = path.posix.dirname(dir);
  }
}

// Map<project, Set<project>>: file edges lifted to owners, self-edges and unowned files dropped.
export function projectEdges(fileEdges, owners) {
  const graph = new Map();
  for (const { from, to } of fileEdges) {
    const a = projectOf(from, owners);
    const b = projectOf(to, owners);
    if (!a || !b || a === b) continue;
    if (!graph.has(a)) graph.set(a, new Set());
    graph.get(a).add(b);
  }
  return graph;
}

// Tarjan's strongly connected components; returns only components of more than one project, each
// ordered along a real cycle so it prints as `a -> b -> a`.
export function findProjectCycles(graph) {
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const cycles = [];
  const visit = (v) => {
    index.set(v, counter); low.set(v, counter); counter += 1;
    stack.push(v); onStack.add(v);
    for (const w of graph.get(v) || []) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const component = [];
    let w;
    do { w = stack.pop(); onStack.delete(w); component.push(w); } while (w !== v);
    if (component.length > 1) cycles.push(orderAlongCycle(component, graph));
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return cycles;
}

function orderAlongCycle(component, graph) {
  const members = new Set(component);
  const start = [...component].sort()[0];
  const parent = new Map([[start, null]]);
  const queue = [start];
  let closer = null;
  while (queue.length && !closer) {
    const v = queue.shift();
    for (const w of graph.get(v) || []) {
      if (!members.has(w)) continue;
      if (w === start) { closer = v; break; }
      if (!parent.has(w)) { parent.set(w, v); queue.push(w); }
    }
  }
  const path_ = [];
  for (let v = closer; v !== null && v !== undefined; v = parent.get(v)) path_.unshift(v);
  const rest = component.filter((c) => !path_.includes(c)).sort();
  return [...path_, ...rest];
}

// The file-walking wrapper main() calls: every source and test file under the scan roots.
export function projectCycleCheck(root = ROOT) {
  const owners = loadProjectOwners(root);
  const files = [];
  for (const r of PROJECT_SCAN_ROOTS) {
    const abs = path.join(root, r);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) {
      files.push(...collectSourceFiles(abs, [], { testFiles: false }), ...collectSourceFiles(abs, [], { testFiles: true }));
    } else files.push(abs);
  }
  const graph = withImplicitEdges(projectEdges(edgesOfFiles(files, root), owners), loadImplicitDependencies(root), owners.values());
  const edgeCount = [...graph.values()].reduce((n, s) => n + s.size, 0);
  return { projects: new Set(owners.values()).size, edgeCount, cycles: findProjectCycles(graph) };
}
