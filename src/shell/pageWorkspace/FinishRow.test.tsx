import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FinishRow from './FinishRow.tsx';

vi.mock('../PdfShareButton.tsx', () => ({
  default: ({ label, visible }: { label: string; visible: boolean }) => (visible ? <button type="button">{label}</button> : null),
}));

const labels = { share: 'Share', compress: 'Compress it', sign: 'Sign it', merge: 'Merge it' };

describe('FinishRow', () => {
  let container: HTMLElement;
  const mount = (tools?: ('compress' | 'sign' | 'merge')[], rowLabels: Parameters<typeof FinishRow>[0]['labels'] = labels, shareReady = true) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(
      <FinishRow ready shareReady={shareReady} onShare={vi.fn()} busy={false} onHandoff={vi.fn()} onWarm={vi.fn()} labels={rowLabels} tools={tools} />,
      container,
    ));
    return [...container.querySelectorAll('button')].map((b) => b.textContent);
  };
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('offers Compress and Sign after Share by default', () => {
    expect(mount()).toEqual(['Share', 'Compress it', 'Sign it']);
  });

  it('renders sign, merge and compress in the order given, each with its label', () => {
    expect(mount(['sign', 'merge', 'compress'])).toEqual(['Share', 'Sign it', 'Merge it', 'Compress it']);
  });

  it('renders only the listed hand-offs, and only Share for an empty list', () => {
    expect(mount(['compress'])).toEqual(['Share', 'Compress it']);
    render(null, container);
    container.remove();
    expect(mount([])).toEqual(['Share']);
  });

  it('renders no button for a tool whose label is missing', () => {
    const { merge: _omit, ...noMerge } = labels;
    expect(mount(['merge', 'compress'], noMerge)).toEqual(['Share', 'Compress it']);
  });

  it('marks the row with how many buttons it renders, so the CSS can lay out four', () => {
    const count = () => container.querySelector('div')!.getAttribute('data-count');
    let rendered: (string | null)[];
    rendered = mount(['sign', 'merge', 'compress']);
    expect(Number(count())).toBe(rendered.length);
    expect(count()).toBe('4');
    render(null, container);
    container.remove();
    rendered = mount();
    expect(Number(count())).toBe(rendered.length);
    expect(count()).toBe('3');
    render(null, container);
    container.remove();
    rendered = mount(['sign', 'merge', 'compress'], labels, false);
    expect(Number(count())).toBe(rendered.length);
    expect(count()).toBe('3');
  });
});
