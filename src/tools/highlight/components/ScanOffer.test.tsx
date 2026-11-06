import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CrookedVerdict } from '../lib/enhance/scanOffer.ts';
import ScanOffer from './ScanOffer.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(over: Partial<{ verdict: CrookedVerdict; busy: boolean; failed: boolean; onStraighten: () => void; onKeepAsIs: () => void }> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const props = { verdict: 'lean' as CrookedVerdict, busy: false, failed: false, onStraighten: vi.fn(), onKeepAsIs: vi.fn(), ...over };
  act(() => render(<ScanOffer {...props} />, container!));
  const root = container.querySelector('[data-scan-offer]') as HTMLElement;
  const buttons = [...root.querySelectorAll('button')] as HTMLButtonElement[];
  return { root, buttons, props };
}

describe('ScanOffer', () => {
  it.each([
    ['sideways', 'This scan is lying on its side.', 'Scan can turn it upright before you start.'],
    ['spread', 'Two pages on each sheet.', 'Scan can split them into single pages before you start.'],
    ['lean', 'This scan leans a little.', 'Scan can square it up before you start.'],
    ['bent', 'These pages curve toward the spine.', 'Scan can flatten them before you start.'],
  ])('says what it found and what Scan does for %s', (verdict, title, detail) => {
    const { root } = mount({ verdict: verdict as CrookedVerdict });
    expect(root.textContent).toContain(title);
    expect(root.textContent).toContain(detail);
    expect(root.getAttribute('role')).toBe('group');
  });

  it('shows the failed line in place of what Scan does', () => {
    const { root } = mount({ failed: true });
    expect(root.textContent).toContain('That did not open. Please try again.');
    expect(root.textContent).not.toContain('Scan can square it up');
  });

  it('calls back from each button', () => {
    const { buttons, props } = mount();
    expect(buttons.map((b) => b.textContent)).toEqual(['Straighten', 'Keep as is']);
    act(() => buttons[0].click());
    act(() => buttons[1].click());
    expect(props.onStraighten).toHaveBeenCalledTimes(1);
    expect(props.onKeepAsIs).toHaveBeenCalledTimes(1);
  });

  it('marks Straighten busy while keeping it focusable, leaving Keep as is', () => {
    const { buttons } = mount({ busy: true });
    expect(buttons[0].getAttribute('aria-disabled')).toBe('true');
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].getAttribute('aria-disabled')).not.toBe('true');
  });
});
