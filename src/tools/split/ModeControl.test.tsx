// @ts-nocheck - matches the other .tsx island tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModeControl from './ModeControl.tsx';
import { englishSplitMessages as t } from '../../i18n/toolMessages';

describe('ModeControl', () => {
  let host;
  afterEach(() => { act(() => render(null, host)); host.remove(); });

  const mount = (mode, onChange = vi.fn(), note) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<ModeControl mode={mode} onChange={onChange} messages={t} note={note} />, host));
    return onChange;
  };
  const radios = () => Array.from(host.querySelectorAll('[role="radio"]'));

  it('is a radiogroup named What to save with the two choices', () => {
    mount('combined');
    expect(host.querySelector('[role="radiogroup"]').getAttribute('aria-label')).toBe('What to save');
    expect(radios().map((r) => r.textContent)).toEqual(['One PDF', 'One PDF per page']);
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1]);
  });

  it('chooses on click, and not when the choice is already on', () => {
    const onChange = mount('combined');
    act(() => radios()[0].click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => radios()[1].click());
    expect(onChange).toHaveBeenCalledWith('separate');
  });

  it('moves with the arrow keys, Home and End', () => {
    const onChange = mount('combined');
    const press = (key) => act(() => radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
    press('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('separate');
    press('End');
    expect(onChange).toHaveBeenLastCalledWith('separate');
  });

  it('shows its note when given one', () => {
    mount('separate', vi.fn(), 'Each selected page becomes its own PDF.');
    expect(host.textContent).toContain('Each selected page becomes its own PDF.');
  });
});
