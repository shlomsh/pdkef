import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FONT_OPTIONS,
  computeFontOptions,
  filterFontOptions,
  FontOptionsList,
} from './FontOptionsList.tsx';
import { englishSignMessages } from '../i18n/toolMessages';

describe('filterFontOptions', () => {
  const options = [{ value: 'Arimo' }, { value: 'Caveat' }, { value: 'Noto Sans JP' }];

  it('returns every option for an empty query', () => {
    expect(filterFontOptions(options, '')).toEqual(options);
    expect(filterFontOptions(options, '   ')).toEqual(options);
  });

  it('filters case-insensitively by substring', () => {
    expect(filterFontOptions(options, 'noto sans j')).toEqual([{ value: 'Noto Sans JP' }]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterFontOptions(options, 'no such face')).toEqual([]);
  });
});

describe('computeFontOptions', () => {
  it('is empty while closed, regardless of text', () => {
    expect(computeFontOptions(false, 'Hello', 'normal', 'normal', 'Hello')).toEqual([]);
  });

  it('computes one entry per catalogue font while open', () => {
    const options = computeFontOptions(true, 'Hello', 'normal', 'normal', 'Hello');
    expect(options).toHaveLength(FONT_OPTIONS.length);
    expect(options.every((option) => 'support' in option)).toBe(true);
  });
});

describe('FontOptionsList', () => {
  let container: HTMLDivElement | null;

  afterEach(() => {
    if (container) {
      act(() => render(null, container as any));
      container.remove();
      container = null;
    }
  });

  function mount(extra = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    const options = computeFontOptions(true, 'Hello', 'normal', 'normal', 'Hello');
    act(() => {
      render(
        <FontOptionsList
          t={englishSignMessages}
          options={options}
          query=""
          onQueryChange={() => {}}
          currentValue="Arimo"
          drawnText="Hello"
          onActivate={() => {}}
          {...extra}
        />,
        container as any,
      );
    });
    return container!;
  }

  it('renders one row per catalogue font, marking the current value selected', () => {
    const list = mount();
    const rows = [...list.querySelectorAll('[role="option"]')];
    expect(rows).toHaveLength(FONT_OPTIONS.length);
    expect(list.querySelector('[data-font-name="Arimo"]')!.getAttribute('aria-selected')).toBe('true');
    expect(list.querySelector('[data-font-name="Caveat"]')!.getAttribute('aria-selected')).toBe('false');
  });

  it('narrows the rows by the query prop', () => {
    const list = mount({ query: 'noto sans j' });
    const rows = [...list.querySelectorAll('[role="option"]')];
    expect(rows.map((row) => row.getAttribute('data-font-name'))).toEqual(['Noto Sans JP']);
  });

  it('shows the empty-result message when nothing matches', () => {
    const list = mount({ query: 'no such face' });
    expect(list.textContent).toContain('No fonts found.');
  });

  it('calls onActivate on row click, and never onHoverPreview without it wired up', () => {
    const onActivate = vi.fn();
    const list = mount({ onActivate });
    act(() => (list.querySelector('[data-font-name="Caveat"]') as HTMLButtonElement).click());
    expect(onActivate).toHaveBeenCalledWith('Caveat');
  });

  it('calls onHoverPreview/onHoverEnd only when wired up (the sheet leaves them out)', () => {
    const onHoverPreview = vi.fn();
    const list = mount({ onHoverPreview });
    act(() => {
      (list.querySelector('[data-font-name="Caveat"]') as HTMLButtonElement)
        .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });
    expect(onHoverPreview).toHaveBeenCalledWith('Caveat');
  });

  it('calls onQueryChange as the search field is typed into', () => {
    const onQueryChange = vi.fn();
    const list = mount({ onQueryChange });
    const search = list.querySelector('input[type="search"]') as HTMLInputElement;
    act(() => {
      search.value = 'noto';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onQueryChange).toHaveBeenCalledWith('noto');
  });
});
