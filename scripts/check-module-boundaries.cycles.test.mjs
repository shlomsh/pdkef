// ARCH-42: the Nx project graph must stay acyclic, or every affected run widens to everything.
// Pure pieces only, driven with fixture graphs; the real tree is asserted by the CLI.
import { describe, expect, it } from 'vitest';
import { projectOf, projectEdges, withImplicitEdges, findProjectCycles } from './check-module-boundaries.mjs';

const owners = new Map([
  ['src/a', 'proj-a'], ['src/b', 'proj-b'], ['src/c', 'proj-c'], ['src', 'root'],
]);

describe('projectOf()', () => {
  it('takes the nearest ancestor directory holding a project.json', () => {
    expect(projectOf('src/a/deep/x.ts', owners)).toBe('proj-a');
    expect(projectOf('src/top.ts', owners)).toBe('root');
  });
  it('is null for a file with no owner', () => {
    expect(projectOf('docs/x.ts', owners)).toBeNull();
  });
});

describe('projectEdges()', () => {
  it('maps file edges to project edges, dropping self-edges and unowned files', () => {
    const edges = projectEdges([
      { from: 'src/a/1.ts', to: 'src/b/2.ts' },
      { from: 'src/a/1.ts', to: 'src/a/3.ts' },
      { from: 'src/a/1.ts', to: 'docs/z.ts' },
    ], owners);
    expect([...edges.entries()]).toEqual([['proj-a', new Set(['proj-b'])]]);
  });
});

describe('withImplicitEdges()', () => {
  it('closes a cycle through an implicitDependencies entry, and ignores unknown names', () => {
    const g = projectEdges([{ from: 'src/a/1.ts', to: 'src/b/2.ts' }], owners);
    expect(findProjectCycles(g)).toEqual([]);
    withImplicitEdges(g, new Map([['proj-b', ['proj-a', 'nope']]]), ['proj-a', 'proj-b']);
    const cycles = findProjectCycles(g);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]].sort()).toEqual(['proj-a', 'proj-b']);
    expect(g.get('proj-b')).toEqual(new Set(['proj-a']));
  });
});

describe('findProjectCycles()', () => {
  it('reports a two-project cycle with both names', () => {
    const g = new Map([['proj-a', new Set(['proj-b'])], ['proj-b', new Set(['proj-a'])]]);
    const cycles = findProjectCycles(g);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]].sort()).toEqual(['proj-a', 'proj-b']);
  });
  it('does not report an acyclic graph', () => {
    const g = new Map([['proj-a', new Set(['proj-b', 'proj-c'])], ['proj-b', new Set(['proj-c'])]]);
    expect(findProjectCycles(g)).toEqual([]);
  });
});
