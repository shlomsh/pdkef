import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const eyedropper = vi.hoisted(() => ({ calls: [] as any[][] }));
vi.mock('../../../editor-ui/whiteout/pageSampling.ts', () => ({
  useEyedropper: (...args: any[]) => { eyedropper.calls.push(args); },
}));
import WhiteoutColorControls from './WhiteoutColorControls.tsx';
import { getRecentWhiteoutColors } from '../../../editor/workspace/preferenceStore.ts';

let host: HTMLDivElement;
beforeEach(() => { localStorage.clear(); eyedropper.calls = []; host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { act(() => render(null, host)); host.remove(); });

const element = (over: object = {}) => ({ id: 'w1', type: 'whiteout', color: '#ffffff', colorMode: 'auto', ...over });
const mount = (el: any, onChange = vi.fn()) => { act(() => render(<WhiteoutColorControls element={el} onChange={onChange} />, host)); return onChange; };
const lastEyedropper = () => eyedropper.calls.at(-1)!;

describe('WhiteoutColorControls', () => {
  it('shows the group with Auto pressed for an auto whiteout, not for a custom one', () => {
    mount(element());
    expect(host.querySelector('[role="group"]')).not.toBeNull();
    expect(host.querySelector('[data-redact-color-auto]')?.getAttribute('aria-pressed')).toBe('true');
    mount(element({ colorMode: 'custom', color: '#336699' }));
    expect(host.querySelector('[data-redact-color-auto]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('Auto sends only the mode, so no colour can be carried', () => {
    const onChange = mount(element({ colorMode: 'custom', color: '#336699' }));
    act(() => (host.querySelector('[data-redact-color-auto]') as HTMLElement).click());
    expect(onChange).toHaveBeenCalledWith({ colorMode: 'auto' });
  });

  it('a pick sets custom mode with the colour and is remembered as a recent', () => {
    const onChange = mount(element({ colorMode: 'custom', color: '#336699' }));
    expect(host.querySelector('[data-redact-color-recent="#336699"]')).not.toBeNull();
    mount(element(), onChange);
    expect(host.querySelector('[data-redact-color-recent]')).toBeNull();
    // the eyedropper is the pick path in jsdom: it hands over a colour
    act(() => (host.querySelector('[data-redact-color-eyedropper]') as HTMLElement).click());
    expect(lastEyedropper()[0]).toBe(true);
    act(() => lastEyedropper()[1]('#abcdef'));
    expect(onChange).toHaveBeenCalledWith({ color: '#abcdef', colorMode: 'custom' });
    expect(getRecentWhiteoutColors()).toContain('#abcdef');
  });

  it('the pipette toggles the eyedropper on Sign pages; Done and a second tap stop it', () => {
    mount(element());
    expect(lastEyedropper()[0]).toBe(false);
    expect(lastEyedropper()[3]).toBe('[data-sign-page-surface]');
    act(() => (host.querySelector('[data-redact-color-eyedropper]') as HTMLElement).click());
    expect(lastEyedropper()[0]).toBe(true);
    act(() => lastEyedropper()[2]());
    expect(lastEyedropper()[0]).toBe(false);
  });

  it('the live preview paints only the box fill in the DOM', () => {
    document.body.insertAdjacentHTML('beforeend', '<div data-editor-element-id="w1"><div data-whiteout-fill></div></div>');
    mount(element());
    const input = host.querySelector('input[type="color"]') as HTMLInputElement;
    input.value = '#123456';
    act(() => { input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect((document.querySelector('[data-whiteout-fill]') as HTMLElement).style.backgroundColor).toBe('rgb(18, 52, 86)');
    document.querySelector('[data-editor-element-id="w1"]')!.remove();
  });
});
