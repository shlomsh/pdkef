import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { isEntry } from './is-entry.mjs';

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'is-entry-')));
const script = path.join(dir, 'guard.mjs');
fs.writeFileSync(script, '');
const link = path.join(dir, 'linked.mjs');
fs.symlinkSync(script, link);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('isEntry', () => {
  const url = pathToFileURL(script).href;
  it('is true for the file node was started with', () => expect(isEntry(url, script)).toBe(true));
  it('is true when node was started through a symlink to it', () => expect(isEntry(url, link)).toBe(true));
  it('is true for a relative start path', () => expect(isEntry(url, path.relative(process.cwd(), script))).toBe(true));
  it('is false for another file', () => expect(isEntry(url, path.join(dir, 'other.mjs'))).toBe(false));
  it('is false when there is no start path (imported from a REPL or a worker)', () => expect(isEntry(url, undefined)).toBe(false));
});
