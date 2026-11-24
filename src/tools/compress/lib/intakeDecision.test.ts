import { describe, expect, it } from 'vitest';
import { decideAfterProbe } from './intakeDecision.ts';

const text = (value: string) => new TextEncoder().encode(value);
const notAPdf = text('just some notes, not a PDF');
const junkWithHeader = text('%PDF-1.7\nthis is junk, not objects');

describe('decideAfterProbe', () => {
  it('skips a file with no PDF header that the reader cannot open', () => {
    expect(decideAfterProbe('unreadable', notAPdf)).toBe('skip');
  });

  it('does not skip a file that has a header but unreadable content', () => {
    expect(decideAfterProbe('unreadable', junkWithHeader)).toBe('run');
  });

  it('finds the header anywhere in the file, as pdf-lib does', () => {
    expect(decideAfterProbe('unreadable', text('junk before\n%PDF-1.4\nand after'))).toBe('run');
  });

  it('waits for a password when the file needs one, header or not', () => {
    expect(decideAfterProbe('needs-password', junkWithHeader)).toBe('needs-password');
    expect(decideAfterProbe('needs-password', notAPdf)).toBe('needs-password');
  });

  it.each(['open', 'owner-restricted'] as const)('runs a %s file', (protection) => {
    expect(decideAfterProbe(protection, junkWithHeader)).toBe('run');
  });

  it('never skips a file the reader opened, even with no header in the bytes it was handed', () => {
    expect(decideAfterProbe('open', notAPdf)).toBe('run');
  });
});
