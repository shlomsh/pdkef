import { describe, expect, it } from 'vitest';
import { prepareToolHistory } from './toolHistory.ts';

// Node has no localStorage: reading it throws, as in a browser with storage blocked.
describe('prepareToolHistory without storage', () => {
  it('is undefined without storage and never throws', () => {
    expect(() => localStorage).toThrow();
    expect(() => prepareToolHistory('sign')).not.toThrow();
    expect(prepareToolHistory('sign')).toBeUndefined();
  });
});
