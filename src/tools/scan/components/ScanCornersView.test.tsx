import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FULL_QUAD } from '../lib/quad.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import ScanCornersView from './ScanCornersView.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('ScanCornersView', () => {
  it('has one primary, Use these corners, and no Done', () => {
    const onApprove = vi.fn();
    const selected = { id: 1, guessed: true, preview: 'p', quad: FULL_QUAD, turns: 0, aspect: 1 } as unknown as ScanPage;
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(
      <ScanCornersView selected={selected} photo={null} shownAspect={1} finding={null} onCommit={vi.fn()} onFind={vi.fn()} onApprove={onApprove} onRemove={vi.fn()} />,
      container!,
    ));
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toContain(t.useCorners);
    expect(labels).not.toContain(t.pageDone);
    act(() => ([...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === t.useCorners) as HTMLButtonElement).click());
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
