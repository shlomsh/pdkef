import { describe, expect, it } from 'vitest';
import { consumeRecentOpen, noteRecentOpen } from './fileArrival.ts';

describe('recent open marker', () => {
  it('survives storage throwing', () => {
    // Live control: under Node, reading sessionStorage really throws.
    expect(() => sessionStorage).toThrow();
    expect(() => noteRecentOpen('sign')).not.toThrow();
    expect(consumeRecentOpen('sign')).toBe(false);
  });
});
