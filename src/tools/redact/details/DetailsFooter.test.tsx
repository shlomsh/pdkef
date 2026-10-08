import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DetailsFooter } from './DetailsFooter.tsx';
import { DETAILS_REVIEW } from '../check/checkCopy.ts';

let host: HTMLElement | null = null;
function mount(vnode: preact.VNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { render(vnode, host!); });
  return host;
}
afterEach(() => { if (host) { render(null, host); host.remove(); host = null; } });

describe('DetailsFooter', () => {
  it('shows the summary in bdi and calls onReview', () => {
    const onReview = vi.fn();
    const el = mount(<DetailsFooter summary="דנה לוי · Acme" onReview={onReview} />);
    const footer = el.querySelector('[data-details-footer]')!;
    expect(footer.querySelector('bdi')!.textContent).toBe('דנה לוי · Acme');
    const button = footer.querySelector('button')!;
    expect(button.textContent).toBe(DETAILS_REVIEW);
    act(() => { button.click(); });
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for an empty summary', () => {
    const el = mount(<DetailsFooter summary="" onReview={() => {}} />);
    expect(el.innerHTML).toBe('');
  });
});
