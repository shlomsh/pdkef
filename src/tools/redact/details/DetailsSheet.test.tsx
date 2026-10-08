import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DetailsSheet } from './DetailsSheet.tsx';
import type { DetailRow } from './describeDetails.ts';
import type { DetailEdits } from '../../../editor/adapters/pdf/detailEdits.js';
import {
  DETAILS_THUMBS, DETAIL_DELETE, DETAIL_DONE, DETAIL_EDIT, DETAIL_IMPLIED, DETAIL_UNDO, DETAILS_CLOSE,
} from '../check/checkCopy.ts';

const ROWS: DetailRow[] = [
  { id: 'title', label: 'Title', text: 'Q3 plan', editable: true },
  { id: 'author', label: 'Author', text: 'דנה לוי', editable: true },
  { id: 'created', label: 'Created', text: '4 Mar 2026, 10:00', iso: '2026-03-04T10:00:00', editable: false },
  { id: 'hidden', label: 'Hidden', text: 'A second copy of these details', editable: false },
];

let host: HTMLElement | null = null;
function mount(edits: DetailEdits = {}, extra: Partial<Parameters<typeof DetailsSheet>[0]> = {}) {
  const props = { onEdit: vi.fn(), onRestore: vi.fn(), onClose: vi.fn() };
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { render(<DetailsSheet open rows={ROWS} edits={edits} {...props} {...extra} />, host!); });
  return { el: host, ...props, ...extra };
}
afterEach(() => { if (host) { render(null, host); host.remove(); host = null; } });

const row = (el: HTMLElement, id: string) => el.querySelector(`[data-detail-row="${id}"]`) as HTMLElement;
const buttons = (r: HTMLElement) => [...r.querySelectorAll('button')].map((b) => b.textContent);
const click = (b: Element) => act(() => { (b as HTMLElement).click(); });
const byText = (r: HTMLElement, text: string) => [...r.querySelectorAll('button')].find((b) => b.textContent === text)!;

function type(input: HTMLInputElement, value: string) {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('DetailsSheet rows', () => {
  it('kept editable shows Edit and Delete; kept non-editable shows Delete only', () => {
    const { el } = mount();
    expect(row(el, 'title').dataset.detailState).toBe('kept');
    expect(buttons(row(el, 'title'))).toEqual([DETAIL_EDIT, DETAIL_DELETE]);
    expect(buttons(row(el, 'created'))).toEqual([DETAIL_DELETE]);
  });

  it('a deleted row is struck through with Undo', () => {
    const { el } = mount({ title: { action: 'delete' } });
    const r = row(el, 'title');
    expect(r.dataset.detailState).toBe('deleted');
    expect(r.querySelector('s')!.textContent).toContain('Q3 plan');
    expect(buttons(r)).toEqual([DETAIL_UNDO]);
  });

  it('an altered row shows the new value with Edit and Delete', () => {
    const { el } = mount({ title: { action: 'alter', value: 'Declaration' } });
    const r = row(el, 'title');
    expect(r.dataset.detailState).toBe('altered');
    expect(r.textContent).toContain('Declaration');
    expect(buttons(r)).toEqual([DETAIL_EDIT, DETAIL_DELETE]);
  });

  it('hidden is implied by an edited detail: struck through, no buttons', () => {
    const { el } = mount({ author: { action: 'delete' } });
    const r = row(el, 'hidden');
    expect(r.dataset.detailState).toBe('implied');
    expect(r.querySelector('s')).not.toBeNull();
    expect(r.textContent).toContain(DETAIL_IMPLIED);
    expect(r.querySelectorAll('button').length).toBe(0);
  });

  it('keeps Hebrew in bdi and dates in time', () => {
    const { el } = mount();
    expect(row(el, 'author').querySelector('bdi')!.textContent).toBe('דנה לוי');
    expect(row(el, 'created').querySelector('time')!.getAttribute('datetime')).toBe('2026-03-04T10:00:00');
  });

  it('has the thumbs line', () => {
    const { el } = mount();
    expect(el.textContent).toContain(DETAILS_THUMBS);
  });
});

describe('DetailsSheet accessibility', () => {
  it('gives every action the row label in its accessible name', () => {
    const { el } = mount({ title: { action: 'delete' } });
    expect(byText(row(el, 'title'), DETAIL_UNDO).getAttribute('aria-label')).toBe('Undo Title');
    expect(byText(row(el, 'author'), DETAIL_EDIT).getAttribute('aria-label')).toBe('Edit Author');
    expect(byText(row(el, 'author'), DETAIL_DELETE).getAttribute('aria-label')).toBe('Delete Author');
    click(byText(row(el, 'author'), DETAIL_EDIT));
    expect(byText(row(el, 'author'), DETAIL_DONE).getAttribute('aria-label')).toBe('Done Author');
  });

  it('prefixes a deleted value with Deleted: and an altered one with Altered: for a screen reader', () => {
    const { el } = mount({ title: { action: 'delete' }, author: { action: 'alter', value: 'X' } });
    expect(row(el, 'title').querySelector('.sr-only')!.textContent).toBe('Deleted: ');
    expect(row(el, 'author').querySelector('.sr-only')!.textContent).toBe('Altered: ');
    expect(row(el, 'created').querySelector('.sr-only')).toBeNull();
  });

  it('the edit input reads its own direction', () => {
    const { el } = mount();
    click(byText(row(el, 'author'), DETAIL_EDIT));
    expect((row(el, 'author').querySelector('input') as HTMLInputElement).getAttribute('dir')).toBe('auto');
  });

  function Stateful() {
    const [edits, setEdits] = useState<DetailEdits>({});
    return (
      <DetailsSheet
        open rows={ROWS} edits={edits}
        onEdit={(id, edit) => setEdits((e) => ({ ...e, [id]: edit }))}
        onRestore={(id) => setEdits((e) => { const n = { ...e }; delete n[id]; return n; })}
        onClose={() => {}}
      />
    );
  }
  const mountStateful = () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => { render(<Stateful />, host!); });
    return host;
  };

  it('moves focus to Undo after Delete, then to Edit (or Delete when not editable) after Undo', () => {
    const el = mountStateful();
    click(byText(row(el, 'title'), DETAIL_DELETE));
    expect(document.activeElement).toBe(byText(row(el, 'title'), DETAIL_UNDO));
    click(byText(row(el, 'title'), DETAIL_UNDO));
    expect(document.activeElement).toBe(byText(row(el, 'title'), DETAIL_EDIT));
    click(byText(row(el, 'created'), DETAIL_DELETE));
    expect(document.activeElement).toBe(byText(row(el, 'created'), DETAIL_UNDO));
    click(byText(row(el, 'created'), DETAIL_UNDO));
    expect(document.activeElement).toBe(byText(row(el, 'created'), DETAIL_DELETE));
  });

  it('moves focus to the row Edit after Done and after Escape in an edit', () => {
    const el = mountStateful();
    click(byText(row(el, 'title'), DETAIL_EDIT));
    type(row(el, 'title').querySelector('input') as HTMLInputElement, 'New');
    click(byText(row(el, 'title'), DETAIL_DONE));
    expect(document.activeElement).toBe(byText(row(el, 'title'), DETAIL_EDIT));
    click(byText(row(el, 'author'), DETAIL_EDIT));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.activeElement).toBe(byText(row(el, 'author'), DETAIL_EDIT));
  });
});

describe('DetailsSheet actions', () => {
  it('Edit, type, Done commits a trimmed alter', () => {
    const { el, onEdit } = mount();
    click(byText(row(el, 'title'), DETAIL_EDIT));
    expect(row(el, 'title').dataset.detailState).toBe('editing');
    const input = row(el, 'title').querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Q3 plan');
    type(input, '  Declaration  ');
    click(byText(row(el, 'title'), DETAIL_DONE));
    expect(onEdit).toHaveBeenCalledWith('title', { action: 'alter', value: 'Declaration' });
  });

  it('Enter commits like Done', () => {
    const { el, onEdit } = mount();
    click(byText(row(el, 'title'), DETAIL_EDIT));
    const input = row(el, 'title').querySelector('input') as HTMLInputElement;
    type(input, 'X');
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(onEdit).toHaveBeenCalledWith('title', { action: 'alter', value: 'X' });
  });

  it('an unchanged or empty value restores the row', () => {
    const { el, onEdit, onRestore } = mount();
    click(byText(row(el, 'title'), DETAIL_EDIT));
    click(byText(row(el, 'title'), DETAIL_DONE));
    expect(onRestore).toHaveBeenCalledWith('title');
    click(byText(row(el, 'author'), DETAIL_EDIT));
    type(row(el, 'author').querySelector('input') as HTMLInputElement, '   ');
    click(byText(row(el, 'author'), DETAIL_DONE));
    expect(onRestore).toHaveBeenCalledWith('author');
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('Escape while editing cancels the edit, not the sheet', () => {
    const { el, onClose, onEdit } = mount();
    click(byText(row(el, 'title'), DETAIL_EDIT));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(row(el, 'title').dataset.detailState).toBe('kept');
    expect(onClose).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Delete edits with delete, Undo restores', () => {
    const { el, onEdit } = mount();
    click(byText(row(el, 'title'), DETAIL_DELETE));
    expect(onEdit).toHaveBeenCalledWith('title', { action: 'delete' });
    const second = mount({ title: { action: 'delete' } });
    click(byText(row(second.el, 'title'), DETAIL_UNDO));
    expect(second.onRestore).toHaveBeenCalledWith('title');
  });

  it('the close button calls onClose', () => {
    const { el, onClose } = mount();
    const close = [...el.querySelectorAll('button')].find((b) => b.textContent === DETAILS_CLOSE && !b.closest('[data-detail-row]'))!;
    click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
