import { describe, expect, it } from 'vitest';
import { redactedFileName } from './redactFileName.ts';

describe('redactedFileName', () => {
  it('prefixes a plain name', () => {
    expect(redactedFileName('x.pdf')).toBe('redacted_x.pdf');
  });
  it('never chains', () => {
    expect(redactedFileName('redacted_x.pdf')).toBe('redacted_x.pdf');
    expect(redactedFileName(redactedFileName('x.pdf'))).toBe('redacted_x.pdf');
  });
  it('leaves a capitalised prefix alone', () => {
    expect(redactedFileName('Redacted_x.pdf')).toBe('Redacted_x.pdf');
  });
  it('prefixes a name with no extension once', () => {
    expect(redactedFileName('notes')).toBe('redacted_notes');
  });
  it('prefixes a name that only contains the word later', () => {
    expect(redactedFileName('my_redacted_x.pdf')).toBe('redacted_my_redacted_x.pdf');
  });
});
