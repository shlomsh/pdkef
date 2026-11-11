import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PinnedNotes from './PinnedNotes.tsx';
import { notesToShow, type PinnedNote } from './pinnedNote';

const note = (tool: string, comment = 'Worked well', stars = 5): PinnedNote =>
  ({ tool, stars, comment, place: 'Nakuru, Kenya' }) as PinnedNote;
const props = { byLine: '{tool} {place}', more: 'Read more', less: 'Show less' };

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) act(() => render(null, container!));
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
});

const fetchSpy = vi.fn();
function mount(notes: unknown[], extra: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', fetchSpy);
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<PinnedNotes {...props} notes={notes as PinnedNote[]} {...extra} />, container!));
}

describe('PinnedNotes', () => {
  it('renders nothing for an empty list, and never fetches', () => {
    mount([]);
    expect(container!.innerHTML).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('renders the comment and by-line from its props', () => {
    mount([note('redact', 'Very clear')]);
    expect(container!.textContent).toContain('Very clear');
    expect(container!.textContent).toContain('Blur & Redact Nakuru, Kenya');
    expect(container!.querySelectorAll('li')).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('shows a vote with no words as stars, tool and the country in the page language', () => {
    const vote = { tool: 'merge', stars: 4, country: 'KE' };
    mount([{ ...vote, region: 'Nakuru' }]);
    expect(container!.textContent).toContain('Merge PDF Nakuru, Kenya');
    act(() => render(null, container!));
    mount([vote]);
    expect(container!.textContent).toContain('Merge PDF Kenya');
    expect(container!.querySelector('svg')!.getAttribute('aria-label')).toBe('4 / 5');
    act(() => render(null, container!));
    mount([vote], { locale: 'he', byLine: '{tool}, מישהו ב{place}' });
    expect(container!.textContent).toContain('קניה');
  });

  it('puts the country flag beside the place, and none without a country', () => {
    mount([{ tool: 'merge', stars: 5, country: 'KE' }], { flags: ['KE'] });
    const flag = container!.querySelector('img')!;
    expect(flag.getAttribute('src')).toBe('/flags/notes.svg#KE');
    expect(flag.getAttribute('width')).toBe('36');
    expect(flag.getAttribute('height')).toBe('24');
    expect(flag.getAttribute('loading')).toBe('lazy');
    expect(flag.getAttribute('alt')).toBe('');
    expect(flag.parentElement!.textContent).toBe('Kenya');
    act(() => render(null, container!));
    mount([note('merge')]);
    expect(container!.querySelector('img')).toBeNull();
  });

  it('draws no flag for a country the sprite does not carry, and still names the place', () => {
    mount([{ tool: 'merge', stars: 5, country: 'KE' }, { tool: 'merge', stars: 5, country: 'XX' }], { flags: ['KE'] });
    const [first, second] = [...container!.querySelectorAll('li')];
    expect(first!.querySelector('img')).not.toBeNull();
    expect(second!.querySelector('img')).toBeNull();
    act(() => render(null, container!));
    mount([{ tool: 'merge', stars: 5, country: 'KE' }]);
    expect(container!.querySelector('img')).toBeNull();
    expect(container!.textContent).toContain('Kenya');
  });

  it('dates a note in the page language, and leaves out a date it does not have', () => {
    mount([{ tool: 'merge', stars: 5, country: 'KE', day: '2026-11-11' }]);
    const time = container!.querySelector('time')!;
    expect(time.getAttribute('datetime')).toBe('2026-11-11');
    expect(time.textContent).toBe('Nov 11, 2026');
    act(() => render(null, container!));
    mount([note('merge')]);
    expect(container!.querySelector('time')).toBeNull();
  });

  it('folds a comment that does not fit and opens the whole note on click, and leaves a short one alone', () => {
    const tall = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60);
    mount([note('redact', 'a long story '.repeat(30)), note('merge', 'also long '.repeat(30))]);
    const [first, second] = [...container!.querySelectorAll('li')];
    const open = first!.querySelector('button')!;
    expect(open.getAttribute('aria-label')).toBe('Read more');
    expect(open.getAttribute('aria-expanded')).toBe('false');
    act(() => open.click());
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(open.getAttribute('aria-label')).toBe('Show less');
    act(() => second!.querySelector('button')!.click());
    expect(open.getAttribute('aria-expanded')).toBe('false');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(second!.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
    act(() => render(null, container!));
    tall.mockReturnValue(60);
    mount([note('redact', 'Short')]);
    expect(container!.querySelector('button')).toBeNull();
    vi.restoreAllMocks();
  });

  it('shows markup in a comment as text', () => {
    mount([note('redact', 'so <b>good</b>')]);
    expect(container!.querySelector('li b')).toBeNull();
    expect(container!.textContent).toContain('so <b>good</b>');
  });
});

describe('notesToShow', () => {
  const all = [note('sign', 'a'), note('redact', 'b'), note('sign', 'c'), note('redact', 'd'), note('redact', 'e'), note('redact', 'f'), note('redact', 'g')];
  it('filters by tool and keeps order', () => {
    expect(notesToShow(all, 'sign' as never).map((n) => n.comment)).toEqual(['a', 'c']);
  });
  it('caps at 9, a three by three board', () => {
    const many = [...all, ...all];
    expect(notesToShow(many, 'redact' as never)).toHaveLength(9);
    expect(notesToShow(many)).toHaveLength(9);
  });
});
