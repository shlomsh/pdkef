import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { main } from './check-editor-dependency-directions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const script = path.join(projectRoot, 'scripts', 'check-editor-dependency-directions.mjs');
const fixtures = path.join(projectRoot, 'scripts', 'fixtures', 'editor-dependency-directions');

function runFixture(name) {
  const out = [];
  const err = [];
  const status = main(['--root', path.join(fixtures, name)], { log: (l) => out.push(String(l)), err: (l) => err.push(String(l)) });
  return { status, stdout: out.join('\n'), stderr: err.join('\n') };
}

let cli;
beforeAll(() => {
  cli = spawnSync(process.execPath, [script, '--root', path.join(fixtures, 'positive')], { encoding: 'utf8' });
});

describe('editor dependency-direction guard', () => {
  it('exits 0 and says passed when run as a command', () => {
    expect(cli.status, cli.stderr).toBe(0);
    expect(cli.stdout).toContain('passed');
  });

  it('accepts resolved imports through the documented seams', () => {
    const result = runFixture('positive');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('passed');
  });

  it('rejects a Preact import from the pure model layer', () => {
    const result = runFixture('negative');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/editor/model/illegal.ts -> preact');
    expect(result.stderr).toContain('model is pure');
  });

  it('rejects browser storage access from the pure model layer', () => {
    const result = runFixture('negative-model-storage');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/editor/model/illegal.ts -> browser storage');
    expect(result.stderr).toContain('model is pure');
  });

  it('rejects a workspace import from text policy', () => {
    const result = runFixture('negative-text-workspace');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/editor/text/illegal.ts -> src/editor/workspace/draftStore.js');
    expect(result.stderr).toContain('text policy');
  });

  it('rejects an unapproved Preact hook from workspace', () => {
    const result = runFixture('negative-workspace-preact');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/editor/workspace/illegal.ts -> preact/hooks');
    expect(result.stderr).toContain('workspace may only reach Preact');
  });

  it('rejects a PDF adapter import from the shared editor-ui shell', () => {
    const result = runFixture('negative-pdf-adapter-editor-ui');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/editor/adapters/pdf/illegal.ts -> src/editor-ui/ColorPicker.tsx');
    expect(result.stderr).toContain('PDF adapters are one-way');
  });

  it('rejects a second file mentioning the box-resize single-owner names, comment mention included', () => {
    const result = runFixture('negative-single-owner');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exactly one file under src/ may mention');
    expect(result.stderr).toContain('found 2');
  });
});
