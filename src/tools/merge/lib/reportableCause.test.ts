import { describe, expect, it } from 'vitest';
import { reportableCause } from './reportableCause.ts';

const mergeFileError = (reason: string, cause?: unknown) =>
  Object.assign(new Error('Could not parse PDF at index 0'), { name: 'MergeFileError', reason, cause });

describe('reportableCause', () => {
  it('unwraps the library error a MergeFileError carries, so its frames travel', () => {
    const cause = new Error('parse');
    expect(reportableCause(mergeFileError('unreadable', cause))).toBe(cause);
  });
  it('keeps a MergeFileError that wraps nothing', () => {
    const err = mergeFileError('unreadable');
    expect(reportableCause(err)).toBe(err);
  });
  it('reports nothing for a password-protected file, the gate handles it', () => {
    expect(reportableCause(mergeFileError('encrypted'))).toBeNull();
  });
  it('passes any other error through', () => {
    const err = new TypeError('x');
    expect(reportableCause(err)).toBe(err);
  });
});
