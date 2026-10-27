import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VerbStage from './VerbStage.tsx';

function mockMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
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
    document.body.innerHTML = '';
  });

  it('adds no listeners under reduced motion', () => {
    mockMotion(true);
    const m = mount();
    expect(m.names(m.sheetAdd)).not.toContain('pointerenter');
    expect(m.names(m.docAdd)).not.toContain('visibilitychange');
  });

  it('adds both with no preference, and removes them on unmount', () => {
    mockMotion(false);
    const m = mount();
    expect(m.names(m.sheetAdd)).toContain('pointerenter');
    expect(m.names(m.docAdd)).toContain('visibilitychange');
    act(() => render(null, m.sheet));
    expect(m.names(m.sheetRemove)).toContain('pointerenter');
    expect(m.names(m.docRemove)).toContain('visibilitychange');
  });
});
