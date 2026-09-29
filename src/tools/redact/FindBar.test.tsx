import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FindBar, { type FindSummary } from './FindBar.tsx';

const base: FindSummary = { open: 3, covered: 0, position: 1, total: 3, pages: 1, reading: { done: 2, of: 20 }, failed: false, currentCovered: false };

describe('FindBar Cover all', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  afterEach(() => act(() => render(null, container)));

  const mount = (summary: FindSummary, extra: { onRedactAll?: () => void; onClose?: () => void } = {}) => {
    act(() => render(
      <FindBar
        term="jane" preset={null} onTermChange={() => {}} onPresetChange={() => {}} summary={summary}
        onPrev={() => {}} onNext={() => {}} redactStyle="blackout" onRedactStyleChange={() => {}}
        onRedactCurrent={() => {}} onRedactAll={extra.onRedactAll ?? (() => {})} onClose={extra.onClose ?? (() => {})}
      />,
      container,
    ));
  };
  const allButton = () => container.querySelector<HTMLButtonElement>('[data-redact-find-all]')!;

  it('queues while reading and delivers once every page is read', () => {
    const onRedactAll = vi.fn();
    mount(base, { onRedactAll });
    expect(allButton().textContent).toBe('Cover all');
    expect(container.textContent).toContain('Reading page 2 of 20');
    act(() => allButton().click());
    expect(onRedactAll).not.toHaveBeenCalled();
    mount({ ...base, reading: { done: 10, of: 20 }, open: 8 }, { onRedactAll });
    expect(onRedactAll).not.toHaveBeenCalled();
    mount({ ...base, reading: null, open: 20, total: 20 }, { onRedactAll });
    expect(onRedactAll).toHaveBeenCalledTimes(1);
    mount({ ...base, reading: null, open: 20, total: 20 }, { onRedactAll });
    expect(onRedactAll).toHaveBeenCalledTimes(1);
  });

  it('covers immediately when reading is already done', () => {
    const onRedactAll = vi.fn();
    mount({ ...base, reading: null }, { onRedactAll });
    expect(allButton().textContent).toBe('Cover all 3');
    act(() => allButton().click());
    expect(onRedactAll).toHaveBeenCalledTimes(1);
  });

  it('cancels a queued Cover all when Find closes', () => {
    const onRedactAll = vi.fn();
    const onClose = vi.fn();
    mount(base, { onRedactAll, onClose });
    act(() => allButton().click());
    const input = container.querySelector('[data-redact-find-input]')!;
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    mount({ ...base, reading: null, open: 20 }, { onRedactAll, onClose });
    expect(onRedactAll).not.toHaveBeenCalled();
  });

  it('keeps Escape from reaching window listeners', () => {
    const onWindow = vi.fn();
    window.addEventListener('keydown', onWindow);
    mount(base);
    const input = container.querySelector('[data-redact-find-input]')!;
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    window.removeEventListener('keydown', onWindow);
    expect(onWindow).not.toHaveBeenCalled();
  });
});
