import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ThicknessPickerMenu from './ThicknessPickerMenu.tsx';

describe('ThicknessPickerMenu', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  async function open(props: Record<string, unknown> = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => { render(<ThicknessPickerMenu onChange={() => {}} itemTitle="{n}px thickness" {...props} />, host); });
    await act(async () => { host.querySelector('button')!.click(); });
    return host;
  }

  it('draws the line glyph, and offers the seven thicknesses as drawn lines', async () => {
    const host = await open();
    expect(host.querySelector('button line')).not.toBeNull();
    expect(document.body.querySelectorAll('[data-editor-thickness]').length).toBe(7);
    expect(document.body.querySelector('[data-editor-thickness] svg rect')).not.toBeNull();
  });

  it('marks the current thickness and names each one', async () => {
    await open({ value: 5 });
    const item = document.body.querySelector('[data-editor-thickness="5"]')!;
    expect(item.className).toMatch(/is-selected/);
    expect(item.getAttribute('title')).toBe('5px thickness');
  });

  it('a pick reports the thickness and closes the menu', async () => {
    const onChange = vi.fn();
    await open({ onChange });
    await act(async () => { document.body.querySelector<HTMLElement>('[data-editor-thickness="8"]')!.click(); });
    expect(onChange).toHaveBeenCalledWith(8);
    expect(document.body.querySelector('[data-editor-thickness]')).toBeNull();
  });
});
