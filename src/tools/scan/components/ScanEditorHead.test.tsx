import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import ScanEditorHead from './ScanEditorHead.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(view: 'result' | 'corners') {
  const onDone = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  const selected = { id: 1, guessed: true, preview: 'p', found: true, edited: false } as unknown as ScanPage;
  act(() => render(
    <ScanEditorHead view={view} selected={selected} selectedIndex={1} pageCount={3} finding={null} findMissed={[]} full={null}
      headingRef={{ current: null }} onRotate={vi.fn()} onToggleFull={vi.fn()} onDone={onDone} />,
    container!,
  ));
  return onDone;
}

describe('ScanEditorHead', () => {
  it('result: Page N of M and a back control to the table and Full screen, no rotate', () => {
    const onDone = mount('result');
    expect(container!.textContent).toContain('Page 2 of 3');
    expect(container!.textContent).not.toContain(t.rotate);
    expect(container!.textContent).toContain(t.fullScreen);
    act(() => (container!.querySelector('[data-back]') as HTMLButtonElement).click());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('corners keeps Rotate and Full screen', () => {
    mount('corners');
    expect(container!.textContent).toContain(t.rotate);
    expect(container!.textContent).toContain(t.fullScreen);
  });
});
