import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRepoOnlyFiles, pruneRepoOnlyFiles } from './repoOnlyFiles.mjs';

function makeDist(files) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-only-'));
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dist, f)), { recursive: true });
    fs.writeFileSync(path.join(dist, f), '{}');
  }
  return dist;
}

describe('findRepoOnlyFiles', () => {
  it('names an Nx project.json copied out of public/, at any depth', () => {
    const dist = makeDist(['index.html', 'fonts/project.json', 'fonts/Alef-Regular.ttf', 'a/b/project.json']);
    expect(findRepoOnlyFiles(dist).sort()).toEqual(['a/b/project.json', 'fonts/project.json']);
  });
  it('names the other repo config files', () => {
    const dist = makeDist(['package.json', 'tsconfig.json', 'nx.json']);
    expect(findRepoOnlyFiles(dist)).toHaveLength(3);
  });
  it('leaves served files alone, including a web manifest', () => {
    const dist = makeDist(['index.html', 'manifest.json', 'precache-manifest.json', 'fonts/Alef-Regular.ttf']);
    expect(findRepoOnlyFiles(dist)).toEqual([]);
  });
  it('returns nothing for a dist/ that does not exist', () => {
    expect(findRepoOnlyFiles(path.join(os.tmpdir(), 'no-such-dist-dir'))).toEqual([]);
  });
});

describe('pruneRepoOnlyFiles', () => {
  it('removes the repo-only files and keeps the rest', () => {
    const dist = makeDist(['fonts/project.json', 'fonts/Alef-Regular.ttf', 'index.html']);
    expect(pruneRepoOnlyFiles(dist)).toEqual(['fonts/project.json']);
    expect(findRepoOnlyFiles(dist)).toEqual([]);
    expect(fs.existsSync(path.join(dist, 'fonts/Alef-Regular.ttf'))).toBe(true);
  });
});
