import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FontPickerMenu, { FONT_PREVIEW_DELAY_MS } from './FontPickerMenu.tsx';
import { resolveFontFamily, HANDWRITING_FONTS, TEXT_FONTS } from '../editor/text/fonts.js';

describe('FontPickerMenu', () => {
  let container: HTMLDivElement | null;

  afterEach(() => {
    vi.useRealTimers();
    if (container) {
      act(() => render(null, container as any));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  function openMenu(value: string, text: string, extra = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <FontPickerMenu value={value} text={text} onChange={() => {}} {...extra} />,
        container as any,
      );
    });
    act(() => {
      container!.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return document.body.querySelector('[data-font-picker-menu]') as HTMLElement;
  }

  const options = (menu: HTMLElement) => [...menu.querySelectorAll('[role="option"]')] as HTMLButtonElement[];
  const option = (menu: HTMLElement, family: string) => menu.querySelector(`[data-font-name="${family}"]`) as HTMLButtonElement;

  it('checks the effective font rather than the requested font', () => {
    const text = 'שלום עולם';
    const effective = resolveFontFamily('Caveat', text);
    expect(effective).toBe('Gveret Levin');

    const menu = openMenu(effective, text);
    expect(option(menu, 'Caveat').getAttribute('aria-selected')).toBe('false');
    expect(option(menu, 'Gveret Levin').getAttribute('aria-selected')).toBe('true');
  });

  it('leaves supported rows uncluttered and annotates only incomplete rows', () => {
    const text = 'שלום עולם';
    const menu = openMenu(resolveFontFamily('Caveat', text), text);
    const caveat = option(menu, 'Caveat');
    const gveret = option(menu, 'Gveret Levin');

    expect(caveat.textContent).toContain('Some characters in');
    expect(caveat.textContent).toContain('שלום עולם');
    expect(caveat.textContent).toContain('aren’t available in Caveat.');
    expect(caveat.textContent).toContain('Using Gveret Levin instead.');
    expect(caveat.className).toMatch(/unsupported/);
    expect(gveret.textContent).toBe('Gveret Levin');
    expect(gveret.className).not.toMatch(/unsupported/);
    expect(menu.textContent).not.toContain('Includes all your text');
    expect(menu.textContent).not.toContain('Fonts marked');
  });

  it('keeps spaces in the quoted text and uses a single ellipsis for long text', () => {
    const text = 'שלום עולם '.repeat(6);
    const menu = openMenu('Caveat', text);
    const caveat = option(menu, 'Caveat');

    expect(caveat.textContent).toContain('שלום עולם');
    expect(caveat.textContent).toContain('…');
    expect(caveat.textContent).not.toContain('שלוםע');
  });

  it('uses canonical family names in one alphabetical list', () => {
    const menu = openMenu('Arimo', 'Hello');
    const names = options(menu).map((item) => item.dataset.fontName!);
    const catalogue = [...new Set([...TEXT_FONTS, ...HANDWRITING_FONTS])];
    const sorted = [...catalogue].sort(new Intl.Collator('en', { sensitivity: 'base' }).compare);

    expect(names).toEqual(sorted);
    expect(names).toHaveLength(catalogue.length);
    expect(options(menu).map((item) => item.childNodes[0].textContent)).toEqual(names);
    expect(menu.textContent).not.toContain('Hebrew (');
    expect(menu.textContent).not.toContain('Arabic (');
    expect(menu.textContent).not.toContain('Helvetica');
  });

  it('filters case-insensitively by font family name and shows an empty result', () => {
    const menu = openMenu('Arimo', 'Hello');
    const search = menu.querySelector('input[type="search"]') as HTMLInputElement;
    expect(document.activeElement).toBe(search);

    act(() => {
      search.value = 'noto sans j';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(options(menu).map((item) => item.dataset.fontName)).toEqual(['Noto Sans JP']);

    act(() => {
      search.value = 'no such face';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(options(menu)).toEqual([]);
    expect(menu.textContent).toContain('No fonts found.');
  });

  it('previews after a short hover delay without committing', () => {
    vi.useFakeTimers();
    const onPreview = vi.fn();
    const onChange = vi.fn();
    const menu = openMenu('Arimo', 'Hello', { onPreview, onChange });
    const caveat = option(menu, 'Caveat');

    act(() => { caveat.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(FONT_PREVIEW_DELAY_MS - 1); });
    expect(onPreview).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(onPreview).toHaveBeenCalledWith('Caveat');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels a pending preview when the pointer moves to another font', () => {
    vi.useFakeTimers();
    const onPreview = vi.fn();
    const menu = openMenu('Arimo', 'Hello', { onPreview });

    act(() => { option(menu, 'Caveat').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(FONT_PREVIEW_DELAY_MS / 2); });
    act(() => { option(menu, 'Tinos').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(FONT_PREVIEW_DELAY_MS); });

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith('Tinos');
  });

  it('does not preview a row that the pointer leaves before the delay', () => {
    vi.useFakeTimers();
    const onPreview = vi.fn();
    const menu = openMenu('Arimo', 'Hello', { onPreview });
    const caveat = option(menu, 'Caveat');

    act(() => { caveat.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); });
    act(() => { caveat.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(FONT_PREVIEW_DELAY_MS); });

    expect(onPreview).not.toHaveBeenCalled();
  });

  it('restores the committed preview when the pointer leaves the picker', () => {
    const onPreviewEnd = vi.fn();
    const menu = openMenu('Arimo', 'Hello', { onPreviewEnd });

    act(() => { menu.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })); });
    expect(onPreviewEnd).toHaveBeenCalledOnce();
  });

  it('click commits the font, clears the preview, and closes the picker', () => {
    const onChange = vi.fn();
    const onPreviewEnd = vi.fn();
    const menu = openMenu('Arimo', 'Hello', { onChange, onPreviewEnd });

    act(() => option(menu, 'Caveat').click());
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('Caveat');
    expect(onPreviewEnd).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[data-font-picker-menu]')).toBeNull();
  });

  it('keeps incomplete rows selectable and explains their actual fallback', () => {
    const onChange = vi.fn();
    const menu = openMenu('Arimo', 'Hello مرحبا', { onChange });
    const arimo = option(menu, 'Arimo');

    expect(arimo.disabled).toBe(false);
    expect(arimo.getAttribute('aria-disabled')).not.toBe('true');
    expect(arimo.textContent).toContain('Some characters in');
    expect(arimo.textContent).toContain('Hello مرحبا');
    expect(arimo.textContent).toContain('Using Scheherazade New instead.');
    act(() => arimo.click());
    expect(onChange).toHaveBeenCalledWith('Arimo');
  });

  it('annotates every row when no single font includes a mixed-script string', () => {
    const menu = openMenu('Assistant', 'שלום Hello مرحبا');
    const items = options(menu);
    expect(items.every((item) => item.dataset.fontSupport === 'incompatible')).toBe(true);
    expect(items.every((item) => item.textContent?.includes('Some characters in'))).toBe(true);
    expect(option(menu, 'Assistant').textContent).toContain('مرحبا');
    expect(option(menu, 'Scheherazade New').textContent).toContain('שלום');
  });

  it('shows the effective canonical family in the trigger title', () => {
    const text = 'שלום עולם';
    const effective = resolveFontFamily('Caveat', text);
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<FontPickerMenu value={effective} text={text} onChange={() => {}} />, container as any));
    expect(container.querySelector('button')!.title).toBe('Font: Gveret Levin');
  });
});
