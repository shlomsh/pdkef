// @ts-nocheck - test-only, mirrors the other merge tests' untyped style
import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLinkedHighlight, useMergeMoment, linkKind } from './useLinkedHighlight.ts';

let host;
let moment;

function Harness() {
  const rootRef = useRef(null);
  useLinkedHighlight(rootRef);
  moment = useMergeMoment(rootRef);
  return (
    <div ref={rootRef} data-testid="root">
      <li id="row-a" data-file-id="a" data-link-row><button id="row-btn">a</button></li>
      <li id="row-b" data-file-id="b" data-link-row />
      <div id="page-a1" data-file-id="a"><span id="page-a1-inner" /></div>
      <div id="page-a2" data-file-id="a" />
      <div id="page-b1" data-file-id="b" />
      <p id="outside" />
    </div>
  );
}

const q = (id) => document.getElementById(id);
const fire = (id, type, init = {}) => act(() => {
  q(id).dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
});
const linked = () => [...document.querySelectorAll('[data-linked]')].map((el) => el.id).sort();
const root = () => host.firstElementChild;

function mockMedia(matches) {
  window.matchMedia = vi.fn((query) => ({ matches: matches.includes(query), media: query }));
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  mockMedia([]);
  act(() => render(<Harness />, host));
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
  document.documentElement.removeAttribute('data-merge-page-dragging');
  vi.useRealTimers();
});

describe('linkKind', () => {
  it('names a rail row "row" and any other file-id carrier "page"', () => {
    expect(linkKind(q('row-a'))).toBe('row');
    expect(linkKind(q('page-a1'))).toBe('page');
  });
});

describe('useLinkedHighlight', () => {
  it('hovering a rail row links the row and every page of that file', () => {
    fire('row-a', 'pointerover');
    expect(root().dataset.linking).toBe('row');
    expect(linked()).toEqual(['page-a1', 'page-a2', 'row-a']);
  });

  it('hovering inside a page links by its closest file-id carrier', () => {
    fire('page-a1-inner', 'pointerover');
    expect(root().dataset.linking).toBe('page');
    expect(linked()).toEqual(['page-a1', 'page-a2', 'row-a']);
  });

  it('moving to another file replaces the previous set', () => {
    fire('row-a', 'pointerover');
    fire('page-b1', 'pointerover');
    expect(linked()).toEqual(['page-b1', 'row-b']);
  });

  it('leaving to outside the source clears both attributes', () => {
    fire('row-a', 'pointerover');
    fire('row-a', 'pointerout', { relatedTarget: q('outside') });
    expect(root().dataset.linking).toBeUndefined();
    expect(linked()).toEqual([]);
  });

  it('moving between children of the same source keeps the link', () => {
    fire('row-a', 'pointerover');
    fire('row-a', 'pointerout', { relatedTarget: q('row-btn') });
    expect(linked()).toEqual(['page-a1', 'page-a2', 'row-a']);
  });

  it('focus links and blur clears, even where hover is unavailable', () => {
    mockMedia(['(hover: none)']);
    act(() => { q('row-btn').dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
    expect(root().dataset.linking).toBe('row');
    act(() => { q('row-btn').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: q('outside') })); });
    expect(linked()).toEqual([]);
  });

  it('ignores pointer events where hover is unavailable', () => {
    mockMedia(['(hover: none)']);
    fire('row-a', 'pointerover');
    expect(linked()).toEqual([]);
  });

  it('ignores everything while a page is being dragged', () => {
    document.documentElement.setAttribute('data-merge-page-dragging', '');
    fire('row-a', 'pointerover');
    expect(linked()).toEqual([]);
  });
});

describe('useMergeMoment', () => {
  it('sets data-merge-moment for 2000ms, restarting a running timer', () => {
    vi.useFakeTimers();
    act(() => moment());
    expect(root().hasAttribute('data-merge-moment')).toBe(true);
    vi.advanceTimersByTime(1500);
    act(() => moment());
    vi.advanceTimersByTime(1500);
    expect(root().hasAttribute('data-merge-moment')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(root().hasAttribute('data-merge-moment')).toBe(false);
  });

  it('does nothing under reduced motion', () => {
    mockMedia(['(prefers-reduced-motion: reduce)']);
    act(() => moment());
    expect(root().hasAttribute('data-merge-moment')).toBe(false);
  });
});
