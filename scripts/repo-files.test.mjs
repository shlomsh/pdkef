import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoFiles } from './repo-files.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);

describe('repoFiles', () => {
  let root;
  const write = (file, text = '') => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-files-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    write('.gitignore', 'local/\n');
    write('e2e/tracked.spec.js');
    execFileSync('git', ['add', '.'], { cwd: root });
    write('e2e/new.spec.js');
    write('other/new.txt');
    write('local/ignored.spec.js');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('holds what git tracks and new files, never ignored ones', () => {
    expect([...repoFiles(root)].sort()).toEqual(['.gitignore', 'e2e/new.spec.js', 'e2e/tracked.spec.js', 'other/new.txt']);
  });

  it('narrows to the paths asked for', () => {
    expect([...repoFiles(root, 'e2e')].sort()).toEqual(['e2e/new.spec.js', 'e2e/tracked.spec.js']);
  });
});

// A guard that lists tracked files alone passes a new file until it is committed, and CI is the first to fail it.
describe('guards see new files', () => {
  const guards = fs.readdirSync(here).filter((f) => /^check-.*\.m?js$/.test(f) && !f.includes('.test.'));
  it.each(guards)('%s lists no tracked-only files', (file) => {
    expect(fs.readFileSync(path.join(here, file), 'utf8')).not.toMatch(/\['ls-files'(?!, '-co')/);
  });
});
