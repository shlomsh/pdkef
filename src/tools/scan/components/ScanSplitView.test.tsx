import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import ScanSplitView from './ScanSplitView.tsx';

const page = { id: 1, question: { spine: { top: 0.5, bottom: 0.55 }, rightToLeft: false } } as unknown as ScanPage;
let container: HTMLElement | null = null;
const mount = (props: { splitting?: boolean; failed?: boolean; onOnePage?: () => void; onTwoPages?: (s: unknown) => void } = {}) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(
    <ScanSplitView selected={page} photo="x.jpg" shownAspect={1.4} splitting={props.splitting ?? false} failed={props.failed ?? false} onOnePage={props.onOnePage ?? vi.fn()} onTwoPages={(props.onTwoPages ?? vi.fn()) as never} />,
    container!,
  ));
  return container;
};
const button = (text: string) => [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('ScanSplitView', () => {
  it('asks the question with its hint and both answers', () => {
    mount();
    expect(container!.textContent).toContain(t.splitQuestion);
    expect(container!.textContent).toContain(t.splitHint);
    act(() => button(t.splitOne).click());
    expect(button(t.splitOne)).toBeTruthy();
  });

  it('Two pages hands over the committed spine', () => {
    const onTwoPages = vi.fn();
    mount({ onTwoPages });
    act(() => { container!.querySelectorAll('[role="group"] button')[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    act(() => button(t.splitTwo).click());
    const spine = onTwoPages.mock.calls[0][0];
    expect(spine.top).toBeCloseTo(0.505);
    expect(spine.bottom).toBe(0.55);
  });

  it('One page calls onOnePage', () => {
    const onOnePage = vi.fn();
    mount({ onOnePage });
    act(() => button(t.splitOne).click());
    expect(onOnePage).toHaveBeenCalledTimes(1);
  });

  it('says so when the last try failed', () => {
    mount({ failed: true });
    expect(document.body.textContent).toContain('That did not work');
  });

  it('both answers are disabled while splitting', () => {
    mount({ splitting: true });
    expect(button(t.splitOne).disabled).toBe(true);
    expect(button(t.splitTwo).disabled).toBe(true);
  });
});
