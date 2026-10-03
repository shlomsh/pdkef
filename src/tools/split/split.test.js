import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { splitPdf } from './split.js';

function fixture(name) {
  const buffer = fs.readFileSync(path.resolve(__dirname, '../../lib/__fixtures__/encrypted', name));
  return new File([buffer], name, { type: 'application/pdf' });
}

describe('splitPdf on a protected file', () => {
  // An owner-only file opens without a password, but its page streams are still
  // encrypted: copying them out would write blank pages, so it refuses instead.
  it.each(['combined', 'separate'])('refuses an owner-only file in %s mode', async (mode) => {
    await expect(splitPdf(fixture('owner-only.pdf'), { pageNumbers: [1], mode })).rejects.toThrow(
      /protected/i,
    );
  });
});
