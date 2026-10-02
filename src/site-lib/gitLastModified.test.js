import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  documentationSourceFiles,
  gitFileLastModifiedIso,
  gitToolEntryLastModifiedIso,
  lastModifiedFor,
  toolEntryLineRange,
} from './gitLastModified.js';

describe('documentationSourceFiles', () => {
  it('dates an English page by its YAML alone, never the shared route template', () => {
    // A refactor of `[contentPage].astro` must not re-date every guide: the
    // reader's copy lives in the YAML, so only the YAML's history counts.
    expect(documentationSourceFiles('how-to-sign-a-pdf-on-mac')).toEqual([
      'src/content/content-pages/how-to-sign-a-pdf-on-mac.yaml',
    ]);
  });

  it('dates a localized edition by its own translation file', () => {
    expect(documentationSourceFiles('install-pdf-app', 'he')).toEqual([
      'src/content/localized-pages/he/install-pdf-app.yaml',
    ]);
  });
});

describe('lastModifiedFor', () => {
  it('reads a real commit date for a tracked file and picks the latest of a set', () => {
    const yaml = gitFileLastModifiedIso('src/content/content-pages/how-to-sign-a-pdf-on-mac.yaml');
    const template = gitFileLastModifiedIso('src/pages/[contentPage].astro');
    expect(yaml).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(template).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(lastModifiedFor(['src/content/content-pages/how-to-sign-a-pdf-on-mac.yaml', 'src/pages/[contentPage].astro'])).toBe(
      yaml > template ? yaml : template,
    );
  });

  it('dates an English guide by its YAML commit, unmoved by a later template commit', () => {
    const yaml = gitFileLastModifiedIso('src/content/content-pages/how-to-sign-a-pdf-on-mac.yaml');
    expect(lastModifiedFor(documentationSourceFiles('how-to-sign-a-pdf-on-mac'))).toBe(yaml);
  });

  it('returns null when no file has history', () => {
    expect(gitFileLastModifiedIso('src/does-not-exist.yaml')).toBeNull();
    expect(lastModifiedFor(['src/does-not-exist.yaml'])).toBeNull();
  });
});

// 2026-09-14 shallow-clone incident: a `--depth 1` clone (CI's default, and
// close enough to Vercel's `--depth 10`) grafts its boundary commit in as a
// parentless root that appears to "add" every file, so `git log -1 -- <file>`
// for a file untouched inside the shallow window returns that boundary
// commit's date instead of refusing it. This pair proves the distinction
// directly against a real shallow clone, rather than trusting the shallow
// detection alone: the full worktree gives a real ISO date for a guide last
// touched well before HEAD, and a `--depth 1` clone of that same worktree
// gives null for the identical file.
describe('a shallow clone cannot date a file outside its window', () => {
  let shallowClone;

  beforeAll(() => {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    shallowClone = fs.mkdtempSync(path.join(os.tmpdir(), 'pdkef-shallow-clone-test-'));
    execSync(`git clone --quiet --depth 1 file://${repoRoot} ${shallowClone}`, { encoding: 'utf8' });
  });

  afterAll(() => {
    if (shallowClone) fs.rmSync(shallowClone, { recursive: true, force: true });
  });

  it('dates the guide for real in the full clone, and refuses to date it in the shallow one', () => {
    const fullCloneValue = lastModifiedFor(documentationSourceFiles('how-to-sign-a-pdf-on-mac'));
    expect(fullCloneValue).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Import the module by absolute file:// URL and run it with the shallow
    // clone as cwd, so its `git log` shells out against that clone's own
    // (shallow) .git rather than this worktree's.
    const moduleUrl = `file://${path.join(shallowClone, 'src/site-lib/gitLastModified.js')}`;
    const scriptFile = path.join(shallowClone, 'print-last-modified.mjs');
    fs.writeFileSync(
      scriptFile,
      `import { documentationSourceFiles, lastModifiedFor } from ${JSON.stringify(moduleUrl)};\n` +
        `console.log(JSON.stringify(lastModifiedFor(documentationSourceFiles('how-to-sign-a-pdf-on-mac'))));\n`,
    );
    const shallowCloneOutput = execSync(`node "${scriptFile}"`, { cwd: shallowClone, encoding: 'utf8' }).trim();
    expect(JSON.parse(shallowCloneOutput)).toBeNull();
  });
});

// Sitemap churn: `src/data/tools.js` holds every tool's copy, so dating a tool
// by the whole file re-dated all ten tool pages on every edit to any one of
// them (seven commits on 2026-09-28 left them all stamped with the last one).
// A tool is dated by the history of its own entry's lines instead.
describe('toolEntryLineRange', () => {
  const source = [
    'export const tools = [',
    '  {',
    "    slug: 'sign',",
    "    title: 'Sign',",
    '  },',
    '',
    '  {',
    "    slug: 'merge',",
    '    faq: [',
    '      { q: 1 },',
    '    ],',
    '  },',
    '];',
  ].join('\n');

  it('spans the entry from its opening brace to its closing one', () => {
    expect(toolEntryLineRange(source, 'sign')).toEqual({ start: 2, end: 5 });
    expect(toolEntryLineRange(source, 'merge')).toEqual({ start: 7, end: 12 });
  });

  it('returns null for a slug that has no entry', () => {
    expect(toolEntryLineRange(source, 'nope')).toBeNull();
  });
});

describe('gitToolEntryLastModifiedIso', () => {
  let repo;
  const git = (cmd, date) =>
    execSync(`git ${cmd}`, {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
  const write = (alpha, beta) =>
    fs.writeFileSync(
      path.join(repo, 'tools.js'),
      `export const tools = [\n  {\n    slug: 'alpha',\n    title: '${alpha}',\n  },\n\n  {\n    slug: 'beta',\n    title: '${beta}',\n  },\n];\n`,
    );

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pdkef-tool-entry-test-'));
    git('init --quiet', '2026-01-01T00:00:00Z');
    git('config user.email t@example.com', '2026-01-01T00:00:00Z');
    git('config user.name t', '2026-01-01T00:00:00Z');
    write('a1', 'b1');
    git('add tools.js', '2026-01-01T00:00:00Z');
    git('commit --quiet -m first', '2026-01-01T00:00:00Z');
    write('a1', 'b2');
    git('commit --quiet -am beta-only', '2026-02-01T00:00:00Z');
    write('a2', 'b2');
    git('commit --quiet -am alpha-only', '2026-03-01T00:00:00Z');
  });

  afterAll(() => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
  });

  it("dates each entry by the last commit that touched its own lines, not the file's", () => {
    const opts = { file: 'tools.js', cwd: repo };
    expect(gitToolEntryLastModifiedIso('alpha', opts)).toBe('2026-03-01T00:00:00.000Z');
    expect(gitToolEntryLastModifiedIso('beta', opts)).toBe('2026-02-01T00:00:00.000Z');
  });

  it('returns null for a slug with no entry', () => {
    expect(gitToolEntryLastModifiedIso('gamma', { file: 'tools.js', cwd: repo })).toBeNull();
  });
});
