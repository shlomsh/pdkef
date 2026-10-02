import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RedactBoxToolbar, { type RedactBoxToolbarProps } from './RedactBoxToolbar.tsx';

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
    expect(custom.host.querySelector('[data-redact-color-auto]')!.getAttribute('aria-pressed')).toBe('false');
    act(() => render(null, custom.host)); custom.host.remove();
    const auto = mount({ ...whiteout, colorMode: 'auto' });
    const btn = auto.host.querySelector('[data-redact-color-auto]');
    expect(btn!.getAttribute('aria-pressed')).toBe('true');
    await click(btn);
    expect(auto.onMatchPage).toHaveBeenCalledTimes(1);
  });

  it('eyedropper aria-pressed follows the prop and click toggles it', async () => {
    const { host: h, onToggleEyedropper } = mount(whiteout, { eyedropping: true });
    const btn = h.querySelector('[data-redact-color-eyedropper]');
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

  it('shows the swatch with a check only when not auto, with --swatch set', () => {
    const custom = mount(whiteout);
    const swatch = custom.host.querySelector('[data-redact-color-swatch]') as HTMLElement;
    expect(swatch).not.toBeNull();
    expect(swatch.style.getPropertyValue('--swatch')).toBe('#f7f1de');
    expect(swatch.querySelector('svg')).not.toBeNull();
    act(() => render(null, custom.host)); custom.host.remove();
    const auto = mount({ ...whiteout, colorMode: 'auto' });
    expect(auto.host.querySelector('[data-redact-color-swatch]')).toBeNull();
  });

  it('a whiteoutStroke shows the colour group', () => {
    const { host: h } = mount({ ...base, type: 'whiteoutStroke', color: '#ffffff' });
    expect(h.querySelector('[role="group"][aria-label="Whiteout colour"]')).not.toBeNull();
  });
});

describe('RedactBoxToolbar other types', () => {
  it('blur shows the slider', () => {
    const { host: h } = mount({ ...base, type: 'blur' });
    expect(h.querySelector('[data-editor-blur-strength-slider]')).not.toBeNull();
    expect(h.querySelector('[data-redact-color-auto]')).toBeNull();
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
