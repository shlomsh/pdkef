import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SavedFileCheck from './SavedFileCheck.tsx';
import type { SavedFileCheckState } from './useSavedFileCheck.ts';
import type { Finding } from './check/types.ts';
import type { DocumentTraces } from '../../editor/adapters/pdf/documentTraces.js';
import { ALL_CLEAR, CHECK_UPDATED, picturePagesNote, DETAILS_CHANGED, DETAILS_REVIEW, DETAILS_SURVIVED } from './check/checkCopy.ts';

const EMPTY: DocumentTraces = {
  title: null, author: null, subject: null, keywords: null, creator: null, producer: null,
  creationDate: null, modDate: null, pieceInfo: false, otherInfoKeys: [], xmp: { present: false, hasHistory: false },
  attachments: [], scripts: { document: false, pages: [] }, thumbnails: [], pageDetails: [],
};
const withTraces = (original: DocumentTraces, saved: DocumentTraces) => ({ original, saved });

const inPlace = (placeIndex: number, extra: Partial<Extract<Finding, { kind: 'in-place' }>> = {}): Finding => ({
  kind: 'in-place', place: 'title', text: 'Secret', placeIndex, ...extra,
});

function stateWith(findings: Finding[], traces = withTraces(EMPTY, EMPTY)): SavedFileCheckState {
  const term = { label: 'Secret', source: 'typed' as const, finder: () => [] };
  return {
    status: 'done',
    typed: [],
    outcome: { results: [{ term, findings }], unsolidPages: [], traces, context: { saved: { places: [], picturePages: [] }, original: [] } },
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

describe('SavedFileCheck details line', () => {
  const container = document.createElement('div');
  afterEach(() => act(() => render(null, container)));
  const show = (extra: Record<string, unknown> = {}) =>
    act(() => render(
      <SavedFileCheck state={stateWith([])} onSearch={vi.fn()} onCover={vi.fn()} detailsChanged={[]} detailsSurvived={[]} onReviewDetails={vi.fn()} {...extra} />,
      container,
    ));

  it('renders nothing about details when the person touched none', () => {
    show();
    expect(container.querySelector('[data-details-changed]')).toBeNull();
    expect(container.querySelector('[data-details-survived]')).toBeNull();
    expect(container.querySelector('[data-traces]')).toBeNull();
  });

  it('says what changed and hands Review back', () => {
    const onReviewDetails = vi.fn();
    show({ detailsChanged: [{ name: 'title', verb: 'altered' }, { name: 'author', verb: 'deleted' }], onReviewDetails });
    const line = container.querySelector('[data-details-changed]') as HTMLElement;
    expect(line.textContent).toContain(DETAILS_CHANGED('title altered, author deleted'));
    expect([...line.querySelectorAll('bdi')].map((b) => b.textContent)).toEqual(['title', 'author']);
    const review = Array.from(line.querySelectorAll('button')).find((b) => b.textContent === DETAILS_REVIEW)!;
    act(() => review.click());
    expect(onReviewDetails).toHaveBeenCalledTimes(1);
  });

  it('turns an edit that did not take into an alert naming the details', () => {
    show({ detailsChanged: [{ name: 'title', verb: 'deleted' }], detailsSurvived: ['Title', 'Scripts'] });
    const alert = container.querySelector('[data-details-survived]') as HTMLElement;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe(DETAILS_SURVIVED('Title, Scripts'));
    expect([...alert.querySelectorAll('bdi')].map((b) => b.textContent)).toEqual(['Title', 'Scripts']);
    expect(container.querySelector('[data-details-changed]')).toBeNull();
  });

  it('keeps a Hebrew name alone in its bdi, the verb outside', () => {
    show({ detailsChanged: [{ name: 'שם.pdf', verb: 'deleted' }] });
    const line = container.querySelector('[data-details-changed]') as HTMLElement;
    expect([...line.querySelectorAll('bdi')].map((b) => b.textContent)).toEqual(['שם.pdf']);
    expect(line.textContent).toContain('Details: שם.pdf deleted.');
  });
});

describe('SavedFileCheck disclosure (RED-66)', () => {
  const container = document.createElement('div');
  afterEach(() => act(() => render(null, container)));
  const term = { label: 'Haifa', source: 'covered' as const, finder: () => [] };
  const stateOf = (findings: Finding[], picturePages: number[], pageCount: number, typed: unknown[] = []) => ({
    status: 'done',
    typed,
    outcome: {
      results: [{ term, findings }], unsolidPages: [], traces: withTraces(EMPTY, EMPTY),
      context: { saved: { places: [], picturePages, pages: new Array(pageCount).fill(null) }, original: new Array(pageCount).fill(null) },
    },
  }) as unknown as SavedFileCheckState;
  const show = (state: SavedFileCheckState) =>
    act(() => render(<SavedFileCheck state={state} onSearch={vi.fn()} onCover={vi.fn()} />, container));
  const more = () => container.querySelector('[data-check-more]') as HTMLDetailsElement;

  it('is closed with the all-clear line for a text file with no match', () => {
    show(stateOf([], [], 2));
    expect(more().open).toBe(false);
    expect(container.textContent).toContain(ALL_CLEAR);
  });

  it('shows one picture line and no rows for a one-page picture file', () => {
    show(stateOf([], [0], 1));
    expect(container.textContent).toContain(picturePagesNote([0]));
    expect(container.textContent).not.toContain(ALL_CLEAR);
    expect(container.querySelectorAll('[data-check-term]')).toHaveLength(0);
  });

  it('opens on a surviving in-text finding and lists the row', () => {
    show(stateOf([{ kind: 'in-text', pageIndex: 0 }], [], 2));
    expect(more().open).toBe(true);
    expect(container.querySelectorAll('[data-check-term="Haifa"]')).toHaveLength(1);
  });

  it('shows typed results', () => {
    const typed = [{ term: { label: 'Zed', source: 'typed', finder: () => [] }, findings: [] }];
    show(stateOf([], [], 2, typed));
    expect(container.querySelector('[data-check-term="Zed"]')).not.toBeNull();
  });
});

describe('SavedFileCheck updated state', () => {
  it('asks for a reload when PDkef was updated under the check', () => {
    const container = document.createElement('div');
    act(() => render(<SavedFileCheck state={{ status: 'updated' }} onSearch={() => {}} onCover={() => {}} />, container));
    expect(CHECK_UPDATED).toBe('PDkef was updated while this page was open. Reload the page to check the saved file. Your edits are kept.');
    expect(container.textContent).toBe(CHECK_UPDATED);
  });
});
