import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VerbStage from './VerbStage.tsx';

// setup.js installs a matchMedia that matches every query, which is "reduce" here. Only the
// no-preference answer needs a replacement.
const installedMatchMedia = window.matchMedia;
function noMotionPreference() {
  // Forced: jsdom has no matchMedia, so a no-preference answer cannot be real
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;
}

function mount() {
  const sheet = document.createElement('div');
  sheet.setAttribute('data-empty-state', '');
  document.body.appendChild(sheet);
  const sheetAdd = vi.spyOn(sheet, 'addEventListener');
  const sheetRemove = vi.spyOn(sheet, 'removeEventListener');
  const docAdd = vi.spyOn(document, 'addEventListener');
  const docRemove = vi.spyOn(document, 'removeEventListener');
  act(() => render(<VerbStage />, sheet));
  const names = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => c[0]);
  return { sheet, sheetAdd, sheetRemove, docAdd, docRemove, names };
}

describe('VerbStage replay listeners', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Forced: puts setup.js's matchMedia back
    window.matchMedia = installedMatchMedia;
    document.body.innerHTML = '';
  });

  it('adds no listeners under reduced motion', () => {
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
    const m = mount();
    expect(m.names(m.sheetAdd)).not.toContain('pointerenter');
    expect(m.names(m.docAdd)).not.toContain('visibilitychange');
  });

  it('adds both with no preference, and removes them on unmount', () => {
    noMotionPreference();
    const m = mount();
    expect(m.names(m.sheetAdd)).toContain('pointerenter');
    expect(m.names(m.docAdd)).toContain('visibilitychange');
    act(() => render(null, m.sheet));
    expect(m.names(m.sheetRemove)).toContain('pointerenter');
    expect(m.names(m.docRemove)).toContain('visibilitychange');
  });
});
