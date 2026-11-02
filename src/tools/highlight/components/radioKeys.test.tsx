import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRadioKeyDown, radioTabIndex } from './radioKeys.ts';

let group: HTMLElement | null = null;
afterEach(() => { group?.remove(); group = null; });

/** A radio group of three, the second checked, wired the way the mark panel wires it. */
function mount(checked = 1, dir?: string) {
  group = document.createElement('div');
  group.setAttribute('role', 'radiogroup');
  if (dir) group.setAttribute('dir', dir);
  const clicks = vi.fn();
  for (let i = 0; i < 3; i += 1) {
    const radio = document.createElement('button');
    radio.setAttribute('role', 'radio');
    radio.setAttribute('aria-checked', String(i === checked));
    radio.addEventListener('click', () => clicks(i));
    group.append(radio);
  }
  group.addEventListener('keydown', onRadioKeyDown);
  document.body.append(group);
  return { clicks, radios: [...group.children] as HTMLElement[] };
}
const press = (target: Element, key: string) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

describe('onRadioKeyDown', () => {
  it('an arrow focuses and clicks the next radio from the checked one, and the key goes no further', () => {
    const { clicks, radios } = mount();
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);
    const e = press(radios[1], 'ArrowRight');
    document.body.removeEventListener('keydown', outer);
    expect(clicks).toHaveBeenCalledWith(2);
    expect(document.activeElement).toBe(radios[2]);
    expect(e.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
  });

  it('starts from the focused radio when none is checked, so the first arrow moves on', () => {
    const { clicks, radios } = mount(-1);
    radios[0].focus();
    press(radios[0], 'ArrowRight');
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(clicks).toHaveBeenCalledWith(1);
  });

  it('ArrowDown steps forward and ArrowUp back', () => {
    const { clicks, radios } = mount(-1);
    radios[1].focus();
    press(radios[1], 'ArrowDown');
    expect(clicks).toHaveBeenLastCalledWith(2);
    radios[1].focus();
    press(radios[1], 'ArrowUp');
    expect(clicks).toHaveBeenLastCalledWith(0);
  });

  it('in an RTL group ArrowRight moves back', () => {
    const { clicks, radios } = mount(-1, 'rtl');
    radios[1].focus();
    press(radios[1], 'ArrowRight');
    expect(clicks).toHaveBeenCalledWith(0);
  });

  it('leaves other keys alone', () => {
    const { clicks, radios } = mount();
    const e = press(radios[1], 'Home');
    expect(clicks).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('radioTabIndex', () => {
  it('is 0 on the checked radio, or on the first when none is checked', () => {
    expect([0, 1, 2].map((i) => radioTabIndex(i === 1, i, true))).toEqual([-1, 0, -1]);
    expect([0, 1, 2].map((i) => radioTabIndex(false, i, false))).toEqual([0, -1, -1]);
  });
});
