import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SavedFileCheck from './SavedFileCheck.tsx';
import type { SavedFileCheckState } from './useSavedFileCheck.ts';
import type { Finding } from './check/types.ts';

const inPlace = (placeIndex: number, extra: Partial<Extract<Finding, { kind: 'in-place' }>> = {}): Finding => ({
  kind: 'in-place', place: 'title', text: 'Secret', placeIndex, ...extra,
});

function stateWith(findings: Finding[]): SavedFileCheckState {
  const term = { label: 'Secret', source: 'typed' as const, finder: () => [] };
  return {
    status: 'done',
    typed: [],
    outcome: { results: [{ term, findings }], unsolidPages: [], context: { saved: { places: [], picturePages: [], attachmentCount: 0 }, original: [] } },
  } as unknown as SavedFileCheckState;
}

describe('SavedFileCheck Remove it', () => {
  const container = document.createElement('div');
  afterEach(() => act(() => render(null, container)));

  const buttons = (label: string) => Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === label);

  it('shows Remove it only on removable in-place findings and hands the finding back', () => {
    const removable = inPlace(3);
    const onRemove = vi.fn();
    act(() => render(
      <SavedFileCheck
        state={stateWith([removable, inPlace(4, { place: 'field', removable: false }), { kind: 'in-text', pageIndex: 0 }, { kind: 'visible-in-picture', pageIndex: 1 }])}
        onSearch={vi.fn()}
        onCover={vi.fn()}
        onRemove={onRemove}
      />,
      container,
    ));
    expect(buttons('Remove it')).toHaveLength(1);
    expect(buttons('Add a box over it')).toHaveLength(2);
    act(() => buttons('Remove it')[0].click());
    expect(onRemove).toHaveBeenCalledWith(removable);
  });

  it('disables the button and says so while it works', () => {
    act(() => render(<SavedFileCheck state={stateWith([inPlace(0)])} onSearch={vi.fn()} onCover={vi.fn()} onRemove={vi.fn()} removing />, container));
    const busy = buttons('Removing…')[0] as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
  });
});
