import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FinishRow from './FinishRow.tsx';

vi.mock('../PdfShareButton.tsx', () => ({
  default: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

const labels = { share: 'Share', compress: 'Compress it', sign: 'Sign it', merge: 'Merge it' };

describe('FinishRow', () => {
  let container: HTMLElement;
  const mount = (tools?: ('compress' | 'sign' | 'merge')[]) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(
      <FinishRow ready shareReady onShare={vi.fn()} busy={false} onHandoff={vi.fn()} onWarm={vi.fn()} labels={labels} tools={tools} />,
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
});
