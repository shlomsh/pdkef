// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHandoffPending,
  markHandoffPending,
  releaseHandoffPending,
  releaseHandoffPendingWhenLoaded,
} from './handoffPending.ts';

const KEY = 'pdkef:handoff-pending:';
const root = document.documentElement;

describe('handoff pending marker', () => {
  beforeEach(() => {
    sessionStorage.clear();
    root.removeAttribute('data-handoff-pending');
    document.body.innerHTML = '';
  });
  afterEach(() => vi.useRealTimers());

  it('writes the slug-keyed key the pre-paint script reads, and clears it', () => {
    markHandoffPending('split');
    expect(sessionStorage.getItem(`${KEY}split`)).toBe('1');
    clearHandoffPending('split');
    expect(sessionStorage.getItem(`${KEY}split`)).toBeNull();
  });

  it('marks every page slug a hand-off key opens (Compress Image is the compress hand-off)', () => {
    markHandoffPending('compress');
    expect(sessionStorage.getItem(`${KEY}compress`)).toBe('1');
    expect(sessionStorage.getItem(`${KEY}compress-image`)).toBe('1');
    clearHandoffPending('compress');
    expect(sessionStorage.length).toBe(0);
  });

  it('leaves the editors alone: their hand-off rides the editor restore', () => {
    markHandoffPending('sign');
    markHandoffPending('redact');
    expect(sessionStorage.length).toBe(0);
  });

  it('swallows blocked storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => markHandoffPending('merge')).not.toThrow();
    spy.mockRestore();
  });

  it('releases the attribute at once', () => {
    root.setAttribute('data-handoff-pending', '1');
    releaseHandoffPending();
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
  });

  it('holds the attribute until the tool shows a file, then releases it', async () => {
    root.setAttribute('data-handoff-pending', '1');
    releaseHandoffPendingWhenLoaded();
    expect(root.hasAttribute('data-handoff-pending')).toBe(true);
    const card = document.createElement('div');
    card.setAttribute('data-tool-loaded', '');
    document.body.append(card);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
  });

  it('releases at once when the tool already shows a file', () => {
    root.setAttribute('data-handoff-pending', '1');
    document.body.innerHTML = '<div data-tool-shell></div>';
    releaseHandoffPendingWhenLoaded();
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
  });

  it('releases after the cap when no file ever shows', () => {
    vi.useFakeTimers();
    root.setAttribute('data-handoff-pending', '1');
    releaseHandoffPendingWhenLoaded();
    vi.advanceTimersByTime(7999);
    expect(root.hasAttribute('data-handoff-pending')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
  });
});
