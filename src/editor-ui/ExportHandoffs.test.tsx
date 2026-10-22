import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExportHandoffs, { type ExportHandoffItem } from './ExportHandoffs.tsx';

const Icon: ExportHandoffItem['Icon'] = () => <svg data-testid="icon" aria-hidden="true" />;

const ITEMS: ExportHandoffItem[] = [
  { tool: 'compress', label: 'Compress it', Icon },
  { tool: 'sign', label: 'Sign it', Icon },
];

describe('ExportHandoffs', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);

  afterEach(() => act(() => render(null, container)));

  function mount(busy = false, onHandoff = vi.fn()) {
    act(() => render(<ExportHandoffs items={ITEMS} busy={busy} onHandoff={onHandoff} />, container));
    return Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
  }

  it('renders one button per item with its label and an icon', () => {
    const buttons = mount();
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Compress it', 'Sign it']);
    buttons.forEach((b) => expect(b.querySelector('svg')).not.toBeNull());
  });

  it('disables every button while busy', () => {
    mount(true).forEach((b) => expect(b.disabled).toBe(true));
  });

  it('calls onHandoff with the clicked item\'s tool', () => {
    const onHandoff = vi.fn();
    const [, sign] = mount(false, onHandoff);
    act(() => sign.click());
    expect(onHandoff).toHaveBeenCalledExactlyOnceWith('sign');
  });

  it('renders an optional detail after the label, and nothing when absent', () => {
    act(() => render(
      <ExportHandoffs items={[{ ...ITEMS[0], detail: '45.2 KB' }, ITEMS[1]]} busy={false} onHandoff={vi.fn()} />,
      container,
    ));
    const [withDetail, without] = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    expect(withDetail.textContent?.trim()).toBe('Compress it45.2 KB');
    expect(withDetail.querySelectorAll('span')).toHaveLength(1);
    expect(without.querySelectorAll('span')).toHaveLength(0);
    expect(without.textContent?.trim()).toBe('Sign it');
  });
});
