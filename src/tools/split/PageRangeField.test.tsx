// @ts-nocheck - matches the other .tsx island tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageRangeField from './PageRangeField.tsx';
import { planForFile, skipAll, withIncludedPages } from '../../lib/pagePlan.ts';
import { englishSplitMessages as t } from '../../i18n/toolMessages';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';

describe('PageRangeField', () => {
  let host;
  afterEach(() => {
    if (host) {
      act(() => render(null, host));
      host.remove();
      host = undefined;
    }
    resetActionTrailForTests();
  });

  const mount = (plan, onSelect = vi.fn()) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const draw = (next) => act(() => render(
      <PageRangeField plan={next} pageCount={next.length} onSelect={onSelect} messages={t} />, host,
    ));
    draw(plan);
    return { draw, onSelect };
  };
  const input = () => host.querySelector('#page-selector-input');
  const type = (value) => act(() => {
    input().value = value;
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });

  it('is labelled Pages and shows the whole document as a range', () => {
    mount(planForFile(0, 6));
    expect(host.querySelector('label[for="page-selector-input"]').textContent).toBe('Pages');
    expect(input().value).toBe('1-6');
  });

  // Typing "1-3" passes through "1" and "1-" (an open range): one Undo step, not three.
  it('a range typed in one go is one step: later commits while focused merge into the first', () => {
    const { onSelect, draw } = mount(planForFile(0, 6));
    act(() => { input().dispatchEvent(new FocusEvent('focus')); });
    type('1');
    expect(onSelect).toHaveBeenLastCalledWith([1], { merge: false });
    draw(withIncludedPages(planForFile(0, 6), [1]));
    type('1-3');
    expect(onSelect).toHaveBeenLastCalledWith([1, 2, 3], { merge: true });
    act(() => { input().dispatchEvent(new FocusEvent('blur')); });
    act(() => { input().dispatchEvent(new FocusEvent('focus')); });
    draw(withIncludedPages(planForFile(0, 6), [1, 2, 3]));
    type('4');
    expect(onSelect).toHaveBeenLastCalledWith([4], { merge: false });
  });

  it('commits a valid range that changes the selection and records it', () => {
    const { onSelect } = mount(planForFile(0, 6));
    type('2-3, 5');
    expect(onSelect).toHaveBeenCalledWith([2, 3, 5], { merge: false });
    expect(recentActions().map((a) => a.action ?? a)).toContain('select_pages');
  });

  it('does not commit when the parse keeps the same pages', () => {
    const { onSelect } = mount(planForFile(0, 6));
    type('1-6');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('empty text means every page', () => {
    const plan = withIncludedPages(planForFile(0, 4), [2]);
    const { onSelect } = mount(plan);
    type('');
    expect(onSelect).toHaveBeenCalledWith([1, 2, 3, 4], { merge: false });
  });

  it('keeps the selection and shows the error for an invalid range', () => {
    const { onSelect } = mount(planForFile(0, 4));
    type('9');
    expect(onSelect).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]').textContent).toBe('Page number 9 out of range (1-4)');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().value).toBe('9');
  });

  it('holds the error back while the text ends in a dash or a comma', () => {
    mount(planForFile(0, 4));
    type('2-');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    type('2,');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    type('x,');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    type('x');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('rewrites the text when the plan changes from elsewhere', () => {
    const plan = planForFile(0, 6);
    const { draw } = mount(plan);
    draw(withIncludedPages(plan, [1, 4, 5]));
    expect(input().value).toBe('1, 4-5');
    draw(skipAll(plan));
    expect(input().value).toBe('');
  });

  it('does not rewrite what the person is typing when its own change comes back', () => {
    const plan = planForFile(0, 6);
    const { draw } = mount(plan);
    type('3,5');
    draw(withIncludedPages(plan, [3, 5]));
    expect(input().value).toBe('3,5');
  });

  it('clears an error when the plan changes from elsewhere', () => {
    const plan = planForFile(0, 4);
    const { draw } = mount(plan);
    type('9');
    draw(withIncludedPages(plan, [2]));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(input().value).toBe('2');
  });

  it('shows the Hebrew error text from the catalogue', async () => {
    const { hebrewSplitMessages } = await import('../../i18n/toolMessages');
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<PageRangeField plan={planForFile(0, 4)} pageCount={4} onSelect={vi.fn()} messages={hebrewSplitMessages} />, host));
    type('9');
    expect(host.querySelector('[role="alert"]').textContent).toContain('9');
  });
});
