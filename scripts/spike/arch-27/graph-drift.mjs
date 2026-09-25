#!/usr/bin/env node
// Throwaway spike for ARCH-27: measure how often pdkef's Nx project graph
// (projects + project-to-project dependency edges) actually changed over a
// window of first-parent commits on main. Not wired into CI.
//
// Usage:
//   node scripts/spike/arch-27/graph-drift.mjs <shas-file> <repo-root> <scratch-dir> <out-json>
//
// <shas-file> is a text file, one full sha per line, oldest-first or
// newest-first (order in the file is preserved and used as the diff order).
// <repo-root> is the git worktree to run `git worktree add` from (must be a
// worktree of the pdkef repo; never the shared main checkout).
// <scratch-dir> is scratch space for per-sha worktrees and per-sha graph
// JSON files (kept after the run so graph-<short>.json can be inspected).
// <out-json> is where the final drift report is written.
//
// For each sha this does:
//   git worktree add --detach <scratch>/g-<short> <sha>
//   symlink <repo-root>/node_modules into that worktree (no npm install)
//   NX_DAEMON=false npx nx graph --file=<scratch>/graph-<short>.json
//   git worktree remove --force <scratch>/g-<short>
// then extracts the project set and the source->target dependency edge set
// from graph.dependencies, and diffs each graph against the previous one in
// file order. If <scratch>/graph-<short>.json already exists (a prior run),
// the worktree/nx-graph steps are skipped and that file is reused as-is - a
// rerun after only editing the diff/classification logic below replays in
// seconds instead of regraphing 150+ commits.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function gitLine(repoRoot, sha, format) {
  return run('git', ['-C', repoRoot, 'log', '-1', `--format=${format}`, sha]).trim();
}

function filesChangedBy(repoRoot, sha) {
  // Diff against the first parent specifically (`sha^` = `sha^1`). Plain
  // `git diff-tree <sha>` with no parent named prints NOTHING for a merge
  // commit unless you pass -m/-c, which silently produced an empty file
  // list for the two `Merge remote-tracking branch 'origin/main' into ...`
  // commits in this window and misclassified them as having no structural
  // cause. `git diff --name-only A^ A` diffs two trees directly and works
  // the same way for an ordinary commit or a merge.
  const out = run('git', ['-C', repoRoot, 'diff', '--name-only', `${sha}^`, sha]);
  return out.split('\n').filter(Boolean);
}

// Rename/move pairs for this commit (old path -> new path), first-parent
// diff, content-similarity renames included (matches git's default -M50%).
function renamesIn(repoRoot, sha) {
  const out = run('git', [
    '-C',
    repoRoot,
    'diff',
    '--name-status',
    '-M',
    `${sha}^`,
    sha,
  ]);
  const renames = [];
  for (const line of out.split('\n')) {
    if (!line.startsWith('R')) continue;
    const [, from, to] = line.split('\t');
    if (from && to) renames.push({ from, to });
  }
  return renames;
}

// Same longest-matching-root logic as ownerOf() in scripts/affected-scope.mjs,
// reimplemented here (not imported) because this reads a historical sha's
// graph, not the working tree's live oracle.
function ownerOf(file, roots) {
  let owner = null;
  let ownerRootLength = -1;
  for (const [name, root] of roots) {
    if (file === root || file.startsWith(`${root}/`)) {
      if (root.length > ownerRootLength) {
        owner = name;
        ownerRootLength = root.length;
      }
    }
  }
  return owner;
}

function graphOne(repoRoot, scratchDir, sha) {
  const short = sha.slice(0, 12);
  const wtDir = path.join(scratchDir, `g-${short}`);
  const graphFile = path.join(scratchDir, `graph-${short}.json`);

  if (!existsSync(graphFile)) {
    if (existsSync(wtDir)) {
      run('git', ['-C', repoRoot, 'worktree', 'remove', '--force', wtDir]);
    }
    run('git', ['-C', repoRoot, 'worktree', 'add', '--detach', wtDir, sha]);
    try {
      const nodeModulesLink = path.join(wtDir, 'node_modules');
      if (!existsSync(nodeModulesLink)) {
        symlinkSync(path.join(repoRoot, 'node_modules'), nodeModulesLink);
      }
      run('npx', ['nx', 'graph', `--file=${graphFile}`], {
        cwd: wtDir,
        env: { ...process.env, NX_DAEMON: 'false' },
      });
    } finally {
      run('git', ['-C', repoRoot, 'worktree', 'remove', '--force', wtDir]);
    }
  }

  const raw = JSON.parse(readFileSync(graphFile, 'utf8'));
  const projects = Object.keys(raw.graph.nodes).sort();
  const roots = projects.map((name) => [name, raw.graph.nodes[name]?.data?.root]).filter(([, r]) => r);
  const edgeMap = new Map(); // "source -> target" -> Set(types)
  for (const edges of Object.values(raw.graph.dependencies)) {
    for (const e of edges) {
      const key = `${e.source} -> ${e.target}`;
      if (!edgeMap.has(key)) edgeMap.set(key, new Set());
      edgeMap.get(key).add(e.type);
    }
  }
  const edges = [...edgeMap.entries()]
    .map(([key, types]) => ({ key, types: [...types].sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return { sha, short, projects, edges, roots, graphFile };
}

function diffSets(prevKeys, curKeys) {
  const prevSet = new Set(prevKeys);
  const curSet = new Set(curKeys);
  return {
    added: curKeys.filter((k) => !prevSet.has(k)),
    removed: prevKeys.filter((k) => !curSet.has(k)),
  };
}

// A cross-project source-import edge changed cause: did any file under
// project.json/nx.json/folder-move territory account for it, or does it look
// like an ordinary source import change? We classify per-commit, not
// per-edge, since the files touched by the commit are the only signal we
// have without re-deriving Nx's own inference.
//
// Two structural signals:
//   1. A project-config file changed (project.json/nx.json/tsconfig.json/
//      package.json) - Nx's own registration surface.
//   2. A file moved (git rename) from one project's root into a different
//      one's, even when no project.json was touched - a plain folder move
//      (e.g. ARCH-26's `src/shell/*` -> `src/site-lib/*`) is exactly the
//      edit a hand-written path map would ALSO need in the same commit, so
//      it counts as (a), not as silent drift, even though nothing under
//      `roots` moved. ownerOf() is evaluated against the CURRENT commit's
//      roots (after the move), since that is what decides where the moved
//      file lands today.
function classifyCommit(files, renames, roots) {
  const structural = files.filter(
    (f) =>
      f.endsWith('project.json') ||
      f === 'nx.json' ||
      f.endsWith('tsconfig.json') ||
      /(^|\/)package\.json$/.test(f),
  );
  const crossProjectRenames = renames.filter(
    ({ from, to }) => ownerOf(from, roots) !== ownerOf(to, roots),
  );
  return {
    structural,
    crossProjectRenames,
    isStructural: structural.length > 0 || crossProjectRenames.length > 0,
  };
}

function main() {
  const [, , shasFile, repoRoot, scratchDir, outJson] = process.argv;
  if (!shasFile || !repoRoot || !scratchDir || !outJson) {
    console.error(
      'usage: node graph-drift.mjs <shas-file> <repo-root> <scratch-dir> <out-json>',
    );
    process.exit(1);
  }
  const shas = readFileSync(shasFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  mkdirSync(scratchDir, { recursive: true });

  const graphs = [];
  for (const sha of shas) {
    const date = gitLine(repoRoot, sha, '%cd');
    const subject = gitLine(repoRoot, sha, '%s');
    process.stderr.write(`graphing ${sha.slice(0, 12)} (${date}) ${subject}\n`);
    const g = graphOne(repoRoot, scratchDir, sha);
    graphs.push({ ...g, date, subject });
  }

  const changes = [];
  for (let i = 1; i < graphs.length; i++) {
    const prev = graphs[i - 1];
    const cur = graphs[i];
    const projDiff = diffSets(prev.projects, cur.projects);
    const edgeDiff = diffSets(
      prev.edges.map((e) => e.key),
      cur.edges.map((e) => e.key),
    );
    if (
      projDiff.added.length === 0 &&
      projDiff.removed.length === 0 &&
      edgeDiff.added.length === 0 &&
      edgeDiff.removed.length === 0
    ) {
      continue; // no drift between these two graphed shas
    }
    const files = filesChangedBy(repoRoot, cur.sha);
    const renames = renamesIn(repoRoot, cur.sha);
    const { structural, crossProjectRenames, isStructural } = classifyCommit(
      files,
      renames,
      cur.roots,
    );
    changes.push({
      sha: cur.sha,
      short: cur.short,
      date: cur.date,
      subject: cur.subject,
      projectsAdded: projDiff.added,
      projectsRemoved: projDiff.removed,
      edgesAdded: edgeDiff.added,
      edgesRemoved: edgeDiff.removed,
      filesChanged: files,
      structuralFiles: structural,
      crossProjectRenames,
      bucket: isStructural ? 'a-structural' : 'b-source-import',
    });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    shaCount: shas.length,
    finalHead: {
      sha: graphs[graphs.length - 1].sha,
      projects: graphs[graphs.length - 1].projects,
      edges: graphs[graphs.length - 1].edges,
    },
    changes,
  };
  writeFileSync(outJson, JSON.stringify(out, null, 2));
  console.error(`wrote ${outJson}: ${changes.length} drifting commits out of ${shas.length} graphed`);
}

main();
