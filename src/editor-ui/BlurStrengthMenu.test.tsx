import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import BlurStrengthMenu from './BlurStrengthMenu.tsx';

const labels = { light: 'Light', medium: 'Medium', strong: 'Strong' };

describe('BlurStrengthMenu', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  it('picking light calls onChange once with "light" and closes the menu', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onChange = vi.fn();

    act(() => {
      render(
        <BlurStrengthMenu value="strong" onChange={onChange} title="Blur strength" labels={labels} />,
        container
      );
    });

    const trigger = container.querySelector('[data-editor-blur-strength-trigger]');
    await act(async () => {
      trigger.click();
    });

    const lightItem = document.body.querySelector('[data-editor-blur-strength="light"]');
    expect(lightItem).not.toBeNull();

    await act(async () => {
      lightItem.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('light');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('marks the current level as selected', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <BlurStrengthMenu value="medium" onChange={() => {}} title="Blur strength" labels={labels} />,
        container
      );
    });

    await act(async () => {
      container.querySelector('[data-editor-blur-strength-trigger]').click();
    });

    const mediumItem = document.body.querySelector('[data-editor-blur-strength="medium"]');
    const lightItem = document.body.querySelector('[data-editor-blur-strength="light"]');
    expect(mediumItem.className).toMatch(/is-selected/);
    expect(lightItem.className).not.toMatch(/is-selected/);
  });

  it('defaults to strong selected when value is absent', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <BlurStrengthMenu onChange={() => {}} title="Blur strength" labels={labels} />,
        container
      );
    });

    await act(async () => {
      container.querySelector('[data-editor-blur-strength-trigger]').click();
    });

    const strongItem = document.body.querySelector('[data-editor-blur-strength="strong"]');
    expect(strongItem.className).toMatch(/is-selected/);
  });
});
