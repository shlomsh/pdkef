import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PinnedNotes, { notesToShow } from './PinnedNotes.tsx';
import type { PinnedNote } from './pinnedNote';

const note = (tool: string, comment = 'Worked well', stars = 5): PinnedNote =>
  ({ tool, stars, comment, place: 'Nakuru, Kenya' }) as PinnedNote;
const props = { heading: 'Notes people left', intro: 'Intro text', byLine: '{tool}, someone in {place}' };

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) act(() => render(null, container!));
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function mount(fetchImpl: () => Promise<unknown>, extra: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(<PinnedNotes {...props} {...extra} />, container!);
  });
  await act(async () => {
    await Promise.resolve();
  });
}
const ok = (notes: unknown[]) => () => Promise.resolve({ ok: true, json: () => Promise.resolve({ notes }) });

describe('PinnedNotes', () => {
  it('renders nothing before notes arrive', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PinnedNotes {...props} />, container!));
    expect(container.innerHTML).toBe('');
  });
  it('renders nothing after a failed fetch', async () => {
    await mount(() => Promise.reject(new Error('offline')));
    expect(container!.innerHTML).toBe('');
  });
  it('renders nothing for an empty list', async () => {
    await mount(ok([]));
    expect(container!.innerHTML).toBe('');
  });
  it('renders heading, comment and by-line once fetched', async () => {
    await mount(ok([note('redact', 'Very clear')]));
    expect(container!.querySelector('h2')!.textContent).toBe('Notes people left');
    expect(container!.textContent).toContain('Very clear');
    expect(container!.textContent).toContain('Blur & Redact, someone in Nakuru, Kenya');
    expect(container!.querySelectorAll('li')).toHaveLength(1);
  });
  it('is a plain section by default and a stack card when asked', async () => {
    const body = { json: () => Promise.resolve({ notes: [note('merge')] }) };
    await mount(() => Promise.resolve(body));
    const plain = container!.querySelector('section')!.className;
    act(() => render(null, container!));
    await mount(() => Promise.resolve(body), { card: true });
    expect(container!.querySelector('section')!.className).not.toBe(plain);
  });

  it('shows markup in a comment as text', async () => {
    await mount(ok([note('redact', 'so <b>good</b>')]));
    expect(container!.querySelector('li b')).toBeNull();
    expect(container!.textContent).toContain('so <b>good</b>');
  });
});

describe('notesToShow', () => {
  const all = [note('sign', 'a'), note('redact', 'b'), note('sign', 'c'), note('redact', 'd'), note('redact', 'e'), note('redact', 'f'), note('redact', 'g')];
  it('filters by tool and keeps order', () => {
    expect(notesToShow(all, 'sign' as never).map((n) => n.comment)).toEqual(['a', 'c']);
  });
  it('caps at 4', () => {
    expect(notesToShow(all, 'redact' as never).map((n) => n.comment)).toEqual(['b', 'd', 'e', 'f']);
    expect(notesToShow(all)).toHaveLength(4);
  });
});
