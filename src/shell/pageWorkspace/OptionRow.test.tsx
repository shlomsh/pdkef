import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OptionRow from './OptionRow.tsx';

const TWO = [{ value: 'combined', label: 'One PDF' }, { value: 'separate', label: 'One PDF per page' }];
const THREE = [
  { value: 'png', label: 'PNG', hint: 'Sharp, lossless.' },
  { value: 'jpeg', label: 'JPEG', hint: 'Smaller files.' },
  { value: 'webp', label: 'WebP', hint: 'Smallest.' },
];

describe('OptionRow', () => {
  let host: HTMLElement | null = null;
  afterEach(() => { act(() => render(null, host!)); host!.remove(); });

  const mount = (props = {}) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const onChange = props.onChange ?? vi.fn();
    act(() => render(<OptionRow id="mode" label="What to save" options={TWO} value="combined" dir="ltr" {...props} onChange={onChange} />, host!));
    return onChange;
  };
  const radios = () => Array.from(host!.querySelectorAll('[role="radio"]'));
  const press = (key, index = 0) => act(() => radios()[index].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));

  it('is a radiogroup named by the caller with the choices, one tab stop', () => {
    mount({ showLabel: false });
    expect(host!.querySelector('[role="radiogroup"]').getAttribute('aria-label')).toBe('What to save');
    expect(host!.querySelector('p')).toBeNull();
    expect(radios().map((r) => r.textContent)).toEqual(['One PDF', 'One PDF per page']);
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1]);
  });

  it('shows the label above the group when asked, and names the group by it', () => {
    mount({ options: THREE, value: 'png' });
    const group = host!.querySelector('[role="radiogroup"]');
    const labelEl = host!.querySelector(`#${group.getAttribute('aria-labelledby')}`);
    expect(labelEl.textContent).toBe('What to save');
  });

  it('chooses on click, and not when the choice is already on', () => {
    const onChange = mount();
    act(() => radios()[0].click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => radios()[1].click());
    expect(onChange).toHaveBeenCalledWith('separate');
  });

  it('moves with the arrow keys, Home and End, wrapping at the ends', () => {
    const onChange = mount();
    press('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('separate');
    press('ArrowLeft');
    expect(onChange).toHaveBeenLastCalledWith('separate');
    press('End');
    expect(onChange).toHaveBeenLastCalledWith('separate');
  });

  it('reverses left and right in a right-to-left page', () => {
    const onChange = mount({ options: THREE, value: 'jpeg', dir: 'rtl' });
    press('ArrowRight', 1);
    expect(onChange).toHaveBeenLastCalledWith('png');
    press('ArrowLeft', 1);
    expect(onChange).toHaveBeenLastCalledWith('webp');
  });

  it('shows the note under the control: the given one, else the selected option\'s hint', () => {
    mount({ note: 'Each selected page becomes its own PDF.' });
    expect(host!.textContent).toContain('Each selected page becomes its own PDF.');
    act(() => render(null, host!));
    mount({ options: THREE, value: 'jpeg' });
    expect(host!.textContent).toContain('Smaller files.');
  });

  // The phone bar keeps one line: the note belongs to the full row in the controls.
  it('has no note in its compact form, even when the selected option has a hint', () => {
    mount({ compact: true, note: 'Selected pages become a single PDF.' });
    expect(host!.querySelector('[data-option-note]')).toBeNull();
  });

  it('has no note line when there is nothing to say', () => {
    mount();
    expect(host!.querySelector('[data-option-note]')).toBeNull();
  });

  it('marks the compact form for the phone bar', () => {
    mount({ compact: true });
    expect(host!.firstElementChild.hasAttribute('data-compact')).toBe(true);
  });
});
