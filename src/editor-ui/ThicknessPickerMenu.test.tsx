import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ThicknessPickerMenu from './ThicknessPickerMenu.tsx';

describe('ThicknessPickerMenu', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  async function open(props: Record<string, unknown>) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => { render(<ThicknessPickerMenu onChange={() => {}} {...props} />, host); });
    await act(async () => { host.querySelector('button')!.click(); });
  }

  it('renders the given options and item titles', async () => {
    await open({ options: [4, 8], itemTitle: (n: number) => `size ${n}` });
    const items = [...document.body.querySelectorAll('[data-editor-thickness]')];
    expect(items.map((el) => el.getAttribute('data-editor-thickness'))).toEqual(['4', '8']);
    expect(items.map((el) => el.getAttribute('title'))).toEqual(['size 4', 'size 8']);
    expect(items[0].className).toMatch(/is-selected/);
  });

  it('keeps the seven defaults', async () => {
    await open({});
    expect(document.body.querySelectorAll('[data-editor-thickness]').length).toBe(7);
  });

  it('draws the line glyph by default and a caret with trigger="caret"', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => { render(<ThicknessPickerMenu onChange={() => {}} />, host); });
    expect(host.querySelector('button line')).not.toBeNull();
    expect(host.querySelector('button polyline')).toBeNull();
    act(() => { render(<ThicknessPickerMenu onChange={() => {}} trigger="caret" />, host); });
    expect(host.querySelector('button polyline')?.getAttribute('points')).toBe('6 9 12 15 18 9');
    expect(host.querySelector('button line')).toBeNull();
  });
});
