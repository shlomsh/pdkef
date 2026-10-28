import { describe, expect, it } from 'vitest';
import type { SavedSignature } from '#editor/model/savedSignature.ts';
import {
  MAX_SAVED_SIGNATURES,
  activeAfterSync,
  createSavedSignature,
  fallbackActiveSignature,
  withSavedSignature,
  withoutSavedSignature,
} from './savedSignatureList.ts';

const sig = (id: string): SavedSignature => ({ id, dataUrl: `data:${id}`, aspectRatio: 0.5 });

describe('savedSignatureList', () => {
  it('names a new signature from the time and a random suffix', () => {
    const made = createSavedSignature('data:x', 0.4, 1700, 0.5);
    expect(made).toEqual({ id: 'sig-1700-i', dataUrl: 'data:x', aspectRatio: 0.4 });
  });

  it('puts the newest first and keeps at most ten', () => {
    const full = Array.from({ length: MAX_SAVED_SIGNATURES }, (_, i) => sig(`s${i}`));
    const next = withSavedSignature(full, sig('new'));
    expect(next).toHaveLength(MAX_SAVED_SIGNATURES);
    expect(next[0].id).toBe('new');
    expect(next.map((s) => s.id)).not.toContain(`s${MAX_SAVED_SIGNATURES - 1}`);
  });

  it('removes by id and falls back to the first one left', () => {
    const left = withoutSavedSignature([sig('a'), sig('b')], 'a');
    expect(left.map((s) => s.id)).toEqual(['b']);
    expect(fallbackActiveSignature(left)?.id).toBe('b');
    expect(fallbackActiveSignature([])).toBeNull();
  });

  it('keeps the active signature across a sync when it is still there, else takes the first', () => {
    expect(activeAfterSync([sig('a'), sig('b')], sig('b'))?.id).toBe('b');
    expect(activeAfterSync([sig('a'), sig('b')], sig('gone'))?.id).toBe('a');
    expect(activeAfterSync([], sig('a'))).toBeNull();
  });
});
