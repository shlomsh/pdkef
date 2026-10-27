import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerOf, SITE_E2E_TAG } from './affected-scope.mjs';
import { buildToolRouteMap } from './import-graph.mjs';

/* ARCH-34. site-e2e is split by spec directory so a change reaches only the specs whose pages it can
   change. The split is only safe if (1) every spec under e2e/ belongs to exactly one project that a
   run can select, and (2) a directory's declared tool dependencies cover every tool page its specs
   visit: the reach walk selects a directory by those declarations, so a missing one is a spec that
   silently stops running for a change to the tool it exercises. Both are read from the project.json
   files and spec text on disk, never from a second list. */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

const projects = new Map(
  git('ls-files', '-co', '--exclude-standard', '*project.json')
    .filter((f) => existsSync(join(ROOT, f)))
    .map((f) => {
      const json = JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
      return [json.name, { root: dirname(f), tags: json.tags ?? [], deps: json.implicitDependencies ?? [] }];
    }),
);
const roots = new Map([...projects].map(([name, p]) => [name, p.root]));
const specs = git('ls-files', '-co', '--exclude-standard', 'e2e/**/*.spec.js', 'e2e/*.spec.js');

describe('every e2e/ spec is owned by exactly one project a run can select', () => {
  const OTHER_E2E_OWNERS = new Set(['fonts', 'export-guards']);

  it('finds specs to check', () => {
    expect(specs.length).toBeGreaterThan(50);
  });

  it.each(specs.map((s) => [s]))('%s', (spec) => {
    const owner = ownerOf(spec, roots);
    expect(owner, `no Nx project owns ${spec}: give its directory a project.json tagged "${SITE_E2E_TAG}"`).not.toBeNull();
    const selectable = projects.get(owner).tags.includes(SITE_E2E_TAG) || OTHER_E2E_OWNERS.has(owner);
    expect(selectable, `${spec} is owned by ${owner}, which is neither tagged "${SITE_E2E_TAG}" nor fonts/export-guards`).toBe(true);
  });
});

describe('a site-wide e2e directory declares every tool whose page its specs visit', () => {
  const routeToTool = buildToolRouteMap(join(ROOT, 'src/pages')); // '/slug' -> tool folder
  const toolProject = { 'edit-pages': 'tool-edit-pages' };
  const projectOf = (folder) => toolProject[folder] ?? `tool-${folder}`;

  // A route is a quoted or template string that starts with /slug, optionally behind a locale.
  const ROUTE = /['"`]\/(?:(?:he|id)\/)?([a-z][a-z0-9-]*)(?=[/?'"`])/g;

  const siteProjects = [...projects].filter(([, p]) => p.tags.includes(SITE_E2E_TAG));

  it('has site-wide projects, including the root one', () => {
    expect(siteProjects.map(([name]) => name)).toContain('site-e2e');
    expect(siteProjects.length).toBeGreaterThan(3);
  });

  it.each(siteProjects.map(([name, p]) => [name, p]))('%s', (name, project) => {
    const own = specs.filter((s) => ownerOf(s, roots) === name);
    const visited = new Map(); // tool project -> first "spec: route"
    for (const spec of own) {
      const text = readFileSync(join(ROOT, spec), 'utf8');
      for (const m of text.matchAll(ROUTE)) {
        const folder = routeToTool.get(`/${m[1]}`);
        if (folder && !visited.has(projectOf(folder))) visited.set(projectOf(folder), `${spec}: /${m[1]}`);
      }
    }
    for (const [tool, where] of visited) {
      expect(project.deps, `${name} visits ${where} but does not list ${tool} in implicitDependencies`).toContain(tool);
    }
  });
});
