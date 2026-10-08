import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SavedFileCheck from './SavedFileCheck.tsx';
import type { SavedFileCheckState } from './useSavedFileCheck.ts';
import type { Finding } from './check/types.ts';
import type { DocumentTraces } from '../../editor/adapters/pdf/documentTraces.js';
import { describeTraces } from './check/describeTraces.ts';
import {
  DROP_IT, KEEP_IT, KEPT, TRACES_NONE, TRACES_READ_BACK, TRACES_SURVIVED_ALERT, TRACE_SURVIVED,
} from './check/checkCopy.ts';

const EMPTY: DocumentTraces = {
  title: null, author: null, subject: null, keywords: null, creator: null, producer: null,
  creationDate: null, modDate: null, otherInfoKeys: [], xmp: { present: false, hasHistory: false },
  attachments: [], scripts: { document: false, pages: [] }, thumbnails: [], pageDetails: [],
};
const FULL: DocumentTraces = {
  ...EMPTY,
  title: 'Q3 plan', author: 'דנה לוי', producer: 'Acme Writer',
  creationDate: { iso: '2026-03-04T10:00:00', offsetMinutes: 120 },
  attachments: [{ name: 'notes.txt' }],
  scripts: { document: true, pages: [] },
  xmp: { present: true, hasHistory: false }, thumbnails: [0], pageDetails: [1],
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

describe('SavedFileCheck traces block', () => {
  const container = document.createElement('div');
  afterEach(() => act(() => render(null, container)));
  const show = (traces: ReturnType<typeof withTraces>, extra: Record<string, unknown> = {}) =>
    act(() => render(<SavedFileCheck state={stateWith([], traces)} onSearch={vi.fn()} onCover={vi.fn()} {...extra} />, container));
  const rowsOf = () => Array.from(container.querySelectorAll('[data-trace-row]'));

  it('says one line when the file carried nothing', () => {
    show(withTraces(EMPTY, EMPTY));
    expect(container.textContent).toContain(TRACES_NONE);
    expect(rowsOf()).toHaveLength(0);
  });

  it('lists every detail struck through with a check, then the read-back line', () => {
    show(withTraces(FULL, EMPTY));
    const expected = describeTraces(FULL, { locale: 'en', now: new Date('2026-10-08T12:00:00Z') });
    expect(expected.length).toBeGreaterThanOrEqual(6);
    const rows = rowsOf();
    expect(rows).toHaveLength(expected.length);
    rows.forEach((row, i) => {
      expect(row.textContent).toContain(expected[i].parts.map((p) => p.text).join(''));
      expect(row.querySelector('s')).not.toBeNull();
      expect(row.textContent).toContain('\u2713');
    });
    expect(container.querySelector('h3')?.textContent).toBeTruthy();
    expect(container.textContent).toContain(TRACES_READ_BACK);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('puts a Hebrew value in a bdi', () => {
    show(withTraces(FULL, EMPTY));
    const bdi = Array.from(container.querySelectorAll('bdi')).find((b) => b.textContent === 'דנה לוי');
    expect(bdi?.getAttribute('dir')).toBe('auto');
  });

  it('turns a survived row danger with an alert and no read-back line', () => {
    show(withTraces(FULL, { ...EMPTY, title: 'Q3 plan' }));
    const survived = container.querySelectorAll('[data-trace-survived]');
    expect(survived.length).toBeGreaterThan(0);
    expect(survived[0].querySelector('s')).toBeNull();
    expect(survived[0].textContent).toContain(TRACE_SURVIVED);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(TRACES_SURVIVED_ALERT);
    expect(container.textContent).not.toContain(TRACES_READ_BACK);
  });

  it('offers Keep it on a dropped attachment and hands the name back', () => {
    const onKeepAttachment = vi.fn();
    show(withTraces(FULL, EMPTY), { onKeepAttachment });
    const keep = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === KEEP_IT);
    expect(keep).toHaveLength(1);
    act(() => keep[0].click());
    expect(onKeepAttachment).toHaveBeenCalledWith('notes.txt');
  });

  it('shows Kept and Drop it for a kept attachment', () => {
    const onDropAttachment = vi.fn();
    show(withTraces(FULL, { ...EMPTY, attachments: [{ name: 'notes.txt' }] }), { keptAttachments: ['notes.txt'], onDropAttachment });
    const row = container.querySelector('[data-trace-row^="attachment"]') as HTMLElement;
    expect(container.textContent).toContain(KEPT);
    const drop = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === DROP_IT)!;
    act(() => drop.click());
    expect(onDropAttachment).toHaveBeenCalledWith('notes.txt');
    expect(row.querySelector('s')).toBeNull();
  });
});
