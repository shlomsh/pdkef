import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setScreen } from '../test/support/screen.ts';
import ArmHint from './ArmHint.tsx';
import { useAutoArmHint } from './hooks/toolArming.js';

/* SIGN-31: the one-time lock hint, taught by touch as well as by mouse. The
   test screen is a desktop by default; these tests set it to one device or the other. */
describe('ArmHint and useAutoArmHint', () => {
  let container: HTMLDivElement;

  const pretendDevice = (touch: boolean) => {
    setScreen(touch ? { pointer: 'coarse', hover: 'none' } : { pointer: 'fine', hover: 'hover' });
  };

  let noteArmed: (tool: string | null) => void = () => {};
  const Harness = () => {
    const hint = useAutoArmHint();
    noteArmed = hint.noteArmed;
    return (
      <ArmHint tool="text" label="Text" action="Click on a page to place a text box." locked={false} autoShowTool={hint.autoShowTool}>
        <button type="button">Text</button>
      </ArmHint>
    );
  };

  const mount = () => act(() => { render(<Harness />, container); });
  const bubble = () => document.body.querySelector('[role="tooltip"]');

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { render(null, container); });
    container.remove();
    vi.useRealTimers();
  });

  it('on touch, shows only the double-tap line on the first arm, then fades', () => {
    pretendDevice(true);
    mount();
    expect(bubble()).toBeNull();
    act(() => { noteArmed('text'); });
    expect(bubble()?.textContent).toBe('Double-tap to keep Text on');
    act(() => { vi.advanceTimersByTime(2600); });
    expect(bubble()).toBeNull();
  });

  it('on touch, shows once per device, not once per visit', () => {
    pretendDevice(true);
    mount();
    act(() => { noteArmed('text'); });
    act(() => { vi.advanceTimersByTime(2600); });

    // A new visit: a fresh mount, the same device's storage.
    act(() => { render(null, container); });
    mount();
    act(() => { noteArmed('text'); });
    expect(bubble()).toBeNull();
  });

  it('with a mouse, keeps the full bubble and the once-per-session rule', () => {
    pretendDevice(false);
    mount();
    act(() => { noteArmed('text'); });
    expect(bubble()?.textContent).toContain('Double-click to keep Text on');
    expect(bubble()?.textContent).toContain('Click on a page to place a text box.');
    expect(localStorage.getItem('pdf-toolkit:double-tap-hint-seen')).toBeNull();
  });
});
