import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import BlurStrengthMenu from './BlurStrengthMenu.tsx';
import type { BlurStrength } from '../editor/model/blurStrength.ts';

const labels = { light: 'Light', medium: 'Medium', strong: 'Strong' };

let container: HTMLDivElement | null = null;

afterEach(() => {
  const host = container;
  if (host) {
    act(() => render(null, host));
    host.remove();
    container = null;
  }
  document.body.innerHTML = '';
});

/** Renders the menu, opens it, and returns its trigger. */
async function openMenu(value: BlurStrength | undefined, onChange: (s: BlurStrength) => void = () => {}) {
  const host = document.createElement('div');
  container = host;
  document.body.appendChild(host);
  act(() => {
    render(<BlurStrengthMenu value={value} onChange={onChange} title="Blur strength" labels={labels} />, host);
  });
  const trigger = host.querySelector<HTMLButtonElement>('[data-editor-blur-strength-trigger]')!;
  await act(async () => { trigger.click(); });
  return trigger;
}

const item = (level: BlurStrength) =>
  document.body.querySelector<HTMLButtonElement>(`[data-editor-blur-strength="${level}"]`)!;

describe('BlurStrengthMenu', () => {
  it('picking light calls onChange once with "light" and closes the menu', async () => {
    const onChange = vi.fn();
    const trigger = await openMenu('strong', onChange);

    await act(async () => { item('light').click(); });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('light');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('marks the current level as selected', async () => {
    await openMenu('medium');
    expect(item('medium').className).toMatch(/is-selected/);
    expect(item('light').className).not.toMatch(/is-selected/);
  });

  it('defaults to strong selected when value is absent', async () => {
    await openMenu(undefined);
    expect(item('strong').className).toMatch(/is-selected/);
  });
});
