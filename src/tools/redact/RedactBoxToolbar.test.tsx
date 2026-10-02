import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRedactionSurface } from '../../editor/registry/redactionSurface.ts';
import RedactBoxToolbar, { shownRecents, type RedactBoxToolbarProps } from './RedactBoxToolbar.tsx';

let host: HTMLDivElement | null = null;

afterEach(() => {
  const h = host;
  if (h) { act(() => render(null, h)); h.remove(); host = null; }
  document.body.innerHTML = '';
});

const base = { id: 'e1', pageIndex: 0, left: 10, top: 10, width: 20, height: 5 };
const whiteout = { ...base, type: 'whiteout', color: '#f7f1de' } as any;

function mount(element: any, props: Partial<RedactBoxToolbarProps> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const fns = {
    onToggleEyedropper: vi.fn(), onMatchPage: vi.fn(), onPickColor: vi.fn(), onChangeStrength: vi.fn(),
    onDuplicate: vi.fn(), onDelete: vi.fn(), onRemoveGroup: vi.fn(), onRemoveFindSet: vi.fn(),
  };
  const h = host;
  act(() => {
    render(<RedactBoxToolbar element={element} eyedropping={false} {...fns} {...props} />, h);
  });
  return { host: h, ...fns };
}

const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('RedactBoxToolbar whiteout colour group', () => {
  it('shows Auto pressed only in auto mode and calls onMatchPage', async () => {
    const custom = mount(whiteout);
    expect(custom.host.querySelector('[data-whiteout-color-auto]')!.getAttribute('aria-pressed')).toBe('false');
    act(() => render(null, custom.host)); custom.host.remove();
    const auto = mount({ ...whiteout, colorMode: 'auto' });
    const btn = auto.host.querySelector('[data-whiteout-color-auto]');
    expect(btn!.getAttribute('aria-pressed')).toBe('true');
    await click(btn);
    expect(auto.onMatchPage).toHaveBeenCalledTimes(1);
  });

  it('eyedropper aria-pressed follows the prop and click toggles it', async () => {
    const { host: h, onToggleEyedropper } = mount(whiteout, { eyedropping: true });
    const btn = h.querySelector('[data-whiteout-color-eyedropper]');
    expect(btn!.getAttribute('aria-pressed')).toBe('true');
    await click(btn);
    expect(onToggleEyedropper).toHaveBeenCalledTimes(1);
  });

  it('a change on the colour input calls onPickColor with its value', () => {
    const { host: h, onPickColor } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    expect(input.value).toBe('#f7f1de');
    act(() => {
      input.value = '#123456';
      // preact/compat (the test alias) maps onChange to `input`; plain Preact listens for `change`.
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onPickColor).toHaveBeenCalledTimes(1);
    expect(onPickColor).toHaveBeenCalledWith('#123456');
  });

  it('a committed colour change while a pick is pending leaves the input and the pending pick alone', () => {
    const { host: h, onPickColor, ...fns } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    act(() => {
      input.value = '#123456';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // e.g. an auto re-sample from a move changes the committed colour mid-pick
    act(() => {
      render(<RedactBoxToolbar element={{ ...whiteout, color: '#abcdef' }} eyedropping={false} onPickColor={onPickColor} {...fns} />, h);
    });
    expect(input.value).toBe('#123456');
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onPickColor).toHaveBeenCalledTimes(1);
    expect(onPickColor).toHaveBeenCalledWith('#123456');
  });

  it('input events alone (a picker drag) never call onPickColor', () => {
    const { host: h, onPickColor } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    act(() => {
      input.value = '#111111';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = '#222222';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPickColor).not.toHaveBeenCalled();
  });

  it('the wheel label has no swatch of its own', () => {
    const { host: h } = mount(whiteout);
    expect(h.querySelector('[data-whiteout-color-swatch]')).toBeNull();
    expect(h.querySelector('[data-whiteout-color-custom] svg')).toBeNull();
  });

  it('Duplicate carries its visible label', () => {
    const { host: h } = mount(whiteout);
    const btn = h.querySelector('button[title="Duplicate"]')!;
    expect(btn.textContent).toBe('Duplicate');
    expect(btn.querySelector('svg')).not.toBeNull();
  });

  it('renders the current colour first, then the recents, before the wheel', () => {
    const { host: h } = mount(whiteout, { recentColors: ['#111111', '#F7F1DE', '#222222', '#333333'] });
    const hexes = Array.from(h.querySelectorAll('[data-whiteout-color-recent]')).map((b) => b.getAttribute('data-whiteout-color-recent'));
    expect(hexes).toEqual(['#f7f1de', '#111111', '#222222']);
    const group = h.querySelector('[role="group"]')!;
    expect(group.lastElementChild).toBe(h.querySelector('[data-whiteout-color-custom]'));
  });

  it('a recent is pressed only for the current colour and picks its hex on click', async () => {
    const { host: h, onPickColor } = mount(whiteout, { recentColors: ['#111111'] });
    const current = h.querySelector('[data-whiteout-color-recent="#f7f1de"]')!;
    const other = h.querySelector('[data-whiteout-color-recent="#111111"]')!;
    expect(current.getAttribute('aria-pressed')).toBe('true');
    expect(current.querySelector('svg')).not.toBeNull();
    expect((current.firstElementChild as HTMLElement).style.getPropertyValue('--swatch')).toBe('#f7f1de');
    expect(other.getAttribute('aria-pressed')).toBe('false');
    expect(other.querySelector('svg')).toBeNull();
    await click(other);
    expect(onPickColor).toHaveBeenCalledWith('#111111');
  });

  it('in auto mode the colour is not shown as a recent and nothing is pressed', () => {
    const { host: h } = mount({ ...whiteout, colorMode: 'auto' }, { recentColors: ['#111111'] });
    const all = Array.from(h.querySelectorAll('[data-whiteout-color-recent]'));
    expect(all.map((b) => b.getAttribute('data-whiteout-color-recent'))).toEqual(['#111111']);
    expect(all[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('a whiteoutStroke shows the colour group', () => {
    const { host: h } = mount({ ...base, type: 'whiteoutStroke', color: '#ffffff' });
    expect(h.querySelector('[role="group"][aria-label="Whiteout colour"]')).not.toBeNull();
  });
});

describe('shownRecents', () => {
  it('puts the current colour first, lowercases, dedupes and keeps three', () => {
    expect(shownRecents('#AABBCC', ['#111111', '#aabbcc', '#222222', '#111111', '#333333']))
      .toEqual(['#aabbcc', '#111111', '#222222']);
  });
  it('skips a null or invalid current colour and invalid recents', () => {
    expect(shownRecents(null, ['#111111', 'red'])).toEqual(['#111111']);
    expect(shownRecents('nope', [])).toEqual([]);
  });
});

describe('RedactBoxToolbar live colour preview', () => {
  function withSurface() {
    const box = document.createElement('div');
    box.setAttribute('data-redact-box-id', 'e1');
    document.body.appendChild(box);
    render(renderRedactionSurface('whiteout', '#f7f1de'), box);
    return box.querySelector('.redact-surface--whiteout') as HTMLElement;
  }
  const fire = (input: HTMLInputElement, type: string, value?: string) => {
    act(() => {
      if (value !== undefined) input.value = value;
      input.dispatchEvent(new Event(type, { bubbles: type !== 'blur' }));
    });
  };

  it('an input event repaints the box without committing', () => {
    const fill = withSurface();
    const { host: h, onPickColor } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    fire(input, 'input', '#123456');
    expect(fill.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(onPickColor).not.toHaveBeenCalled();
  });

  it('a change commits exactly once', () => {
    withSurface();
    const { host: h, onPickColor } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    fire(input, 'input', '#123456');
    fire(input, 'change');
    fire(input, 'blur');
    act(() => render(null, h)); h.remove(); host = null;
    expect(onPickColor).toHaveBeenCalledTimes(1);
    expect(onPickColor).toHaveBeenCalledWith('#123456');
  });

  it('a blur with a pending preview commits it', () => {
    withSurface();
    const { host: h, onPickColor } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    fire(input, 'input', '#123456');
    fire(input, 'blur');
    expect(onPickColor).toHaveBeenCalledWith('#123456');
  });

  it('unmounting with a pending preview commits it', () => {
    withSurface();
    const { host: h, onPickColor } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    fire(input, 'input', '#123456');
    act(() => render(null, h));
    expect(onPickColor).toHaveBeenCalledTimes(1);
    expect(onPickColor).toHaveBeenCalledWith('#123456');
  });

  it('a re-render while a pick is pending keeps the pick, the paint and the commit', () => {
    const fill = withSurface();
    const { host: h, onPickColor, ...fns } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    fire(input, 'input', '#123456');
    act(() => {
      render(<RedactBoxToolbar element={whiteout} eyedropping={false} onPickColor={onPickColor} {...fns} />, h);
    });
    expect(input.value).toBe('#123456');
    expect(fill.style.backgroundColor).toBe('rgb(18, 52, 86)');
    fire(input, 'change');
    expect(onPickColor).toHaveBeenCalledTimes(1);
    expect(onPickColor).toHaveBeenCalledWith('#123456');
  });

  it('input, blur, change with no render between commits once', () => {
    withSurface();
    const { host: h, onPickColor } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    fire(input, 'input', '#123456');
    fire(input, 'blur');
    fire(input, 'change');
    expect(onPickColor).toHaveBeenCalledTimes(1);
  });

  it('the input follows a changed committed colour when nothing is pending', () => {
    const { host: h, onPickColor, ...fns } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    act(() => {
      render(<RedactBoxToolbar element={{ ...whiteout, color: '#abcdef' }} eyedropping={false} onPickColor={onPickColor} {...fns} />, h);
    });
    expect(input.value).toBe('#abcdef');
  });

  it('settling back on the original colour commits nothing and repaints it', () => {
    const fill = withSurface();
    const { host: h, onPickColor } = mount(whiteout);
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    fire(input, 'input', '#123456');
    fire(input, 'change', '#f7f1de');
    expect(onPickColor).not.toHaveBeenCalled();
    expect(fill.style.backgroundColor).toBe('rgb(247, 241, 222)');
  });
});

describe('RedactBoxToolbar other types', () => {
  it('blur shows the slider', () => {
    const { host: h } = mount({ ...base, type: 'blur' });
    expect(h.querySelector('[data-editor-blur-strength-slider]')).not.toBeNull();
    expect(h.querySelector('[data-whiteout-color-auto]')).toBeNull();
  });

  it('a blur slider change commits through onChangeStrength', () => {
    const { host: h, onChangeStrength } = mount({ ...base, type: 'blur' });
    const input = h.querySelector('[data-editor-blur-strength-slider] input') as HTMLInputElement;
    act(() => {
      input.value = String(input.max);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChangeStrength).toHaveBeenCalled();
  });

  it('blackout has no settings group and exactly Duplicate + Delete', () => {
    const { host: h } = mount({ ...base, type: 'blackout' });
    expect(h.querySelector('[role="group"]')).toBeNull();
    const buttons = Array.from(h.querySelectorAll('button'));
    expect(buttons.map((b) => b.title)).toEqual(['Duplicate', 'Delete']);
  });

  it('Duplicate and Delete call their handlers', async () => {
    const { host: h, onDuplicate, onDelete } = mount({ ...base, type: 'blackout' });
    await click(h.querySelector('button[title="Duplicate"]'));
    await click(h.querySelector('button[title="Delete"]'));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('RedactBoxToolbar repeat and delete scope (RED-03, RED-11)', () => {
  const blackout = { ...base, type: 'blackout' } as any;

  it('an unlinked box deletes in one tap and offers the plain repeat button', async () => {
    const { host: h, onDelete } = mount(blackout, { onRepeatOnEveryPage: () => {} });
    expect(h.querySelector('[data-editor-repeat-every-page]')).not.toBeNull();
    expect(h.querySelector('[data-editor-delete-scope-trigger]')).toBeNull();
    await click(h.querySelector('button[title="Delete"]'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('a linked box shows its set size and trash asks: this page or all pages', async () => {
    const { host: h, onDelete, onRemoveGroup } = mount(blackout, { repeatGroupSize: 12, onUnlinkFromGroup: () => {} });
    expect(h.querySelector('[data-editor-repeat-group-trigger]')!.textContent).toContain('12');
    expect(h.querySelector('[data-editor-repeat-every-page]')).toBeNull();
    await click(h.querySelector('[data-editor-delete-scope-trigger]'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-editor-delete-all-pages]')!.textContent).toBe('All 12 pages');
    await click(document.body.querySelector('[data-editor-delete-this-page]'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await click(h.querySelector('[data-editor-delete-scope-trigger]'));
    await click(document.body.querySelector('[data-editor-delete-all-pages]'));
    expect(onRemoveGroup).toHaveBeenCalledTimes(1);
  });

  it('the linked set menu holds unlink, and fill only when pages are left', async () => {
    const onUnlinkFromGroup = vi.fn();
    const { host: h } = mount(blackout, { repeatGroupSize: 3, onUnlinkFromGroup });
    await click(h.querySelector('[data-editor-repeat-group-trigger]'));
    expect(document.body.querySelector('[data-editor-repeat-group-fill]')).toBeNull();
    await click(document.body.querySelector('[data-editor-repeat-group-unlink]'));
    expect(onUnlinkFromGroup).toHaveBeenCalledTimes(1);
  });

  it('a found box offers "This box" and "All 3 from this search"', async () => {
    const { host: h, onDelete, onRemoveFindSet } = mount(blackout, { findSetSize: 3 });
    await click(h.querySelector('[data-editor-delete-scope-trigger]'));
    await click(document.body.querySelector('[data-editor-delete-this-box]'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await click(h.querySelector('[data-editor-delete-scope-trigger]'));
    expect(document.body.querySelector('[data-editor-delete-find-set]')!.textContent).toBe('All 3 from this search');
    await click(document.body.querySelector('[data-editor-delete-find-set]'));
    expect(onRemoveFindSet).toHaveBeenCalledTimes(1);
  });

  it('a box both linked and in a find set shows three items in order', async () => {
    const { host: h } = mount(blackout, { findSetSize: 4, repeatGroupSize: 5, onUnlinkFromGroup: () => {} });
    await click(h.querySelector('[data-editor-delete-scope-trigger]'));
    const items = Array.from(document.body.querySelectorAll('[data-editor-delete-this-page], [data-editor-delete-all-pages], [data-editor-delete-find-set]'));
    expect(items.map((el) => el.textContent)).toEqual(['This page', 'All 5 pages', 'All 4 from this search']);
  });

  it('findSetSize of 1 keeps the one-tap trash', async () => {
    const { host: h, onDelete } = mount(blackout, { findSetSize: 1 });
    expect(h.querySelector('[data-editor-delete-scope-trigger]')).toBeNull();
    await click(h.querySelector('button[title="Delete"]'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
