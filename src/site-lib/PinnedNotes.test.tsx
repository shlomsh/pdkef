import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PinnedNotes, { notesToShow } from './PinnedNotes.tsx';
import type { PinnedNote } from './pinnedNote';

const note = (tool: string, comment = 'Worked well', stars = 5): PinnedNote =>
  ({ tool, stars, comment, place: 'Nakuru, Kenya' }) as PinnedNote;
const props = { byLine: '{tool}, someone in {place}' };

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
  it('renders the comment and by-line once fetched', async () => {
    await mount(ok([note('redact', 'Very clear')]));
    expect(container!.textContent).toContain('Very clear');
    expect(container!.textContent).toContain('Blur & Redact, someone in Nakuru, Kenya');
    expect(container!.querySelectorAll('li')).toHaveLength(1);
  });
  it('shows a vote with no words as stars, tool and the country in the page language', async () => {
    const vote = { tool: 'merge', stars: 4, country: 'KE' };
    await mount(ok([{ ...vote, region: 'Nakuru' }]));
    expect(container!.textContent).toContain('Merge PDF, someone in Nakuru, Kenya');
    act(() => render(null, container!));
    await mount(ok([vote]));
    expect(container!.textContent).toContain('Merge PDF, someone in Kenya');
    expect(container!.querySelector('svg')!.getAttribute('aria-label')).toBe('4 / 5');
    act(() => render(null, container!));
    await mount(ok([vote]), { locale: 'he', byLine: '{tool}, מישהו ב{place}' });
    expect(container!.textContent).toContain('קניה');
  });

  it('puts the country flag beside the place, and none without a country', async () => {
    await mount(ok([{ tool: 'merge', stars: 5, country: 'KE' }]));
    const flag = container!.querySelector('img')!;
    expect(flag.getAttribute('src')).toBe('/flags/KE.svg');
    expect(flag.getAttribute('alt')).toBe('');
    expect(flag.parentElement!.textContent).toBe('Kenya');
    act(() => render(null, container!));
    await mount(ok([note('merge')]));
    expect(container!.querySelector('img')).toBeNull();
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
