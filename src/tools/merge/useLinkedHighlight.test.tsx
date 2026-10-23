// @ts-nocheck - test-only, mirrors the other merge tests' untyped style
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLinkedHighlight, useMergeMoment, linkKind } from './useLinkedHighlight.ts';

let host;
let moment;

function Harness() {
  const [rootEl, setRootEl] = useState(null);
  useLinkedHighlight(rootEl);
  moment = useMergeMoment(rootEl);
  return (
    <div ref={setRootEl} data-testid="root">
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
// jsdom has no PointerEvent, so the pointer type rides on a MouseEvent.
const fire = (id, type, { pointerType = 'mouse', ...init } = {}) => act(() => {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  q(id).dispatchEvent(event);
});
const focusIn = (id) => act(() => { q(id).dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });

// Keyboard focus matches :focus-visible; jsdom cannot decide it, so stub it.
function stubFocusVisible(visible) {
  const original = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (selector) {
    return selector === ':focus-visible' ? visible : original.call(this, selector);
  });
}
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
  vi.restoreAllMocks();
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
    stubFocusVisible(true);
    focusIn('row-btn');
    expect(root().dataset.linking).toBe('row');
    act(() => { q('row-btn').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: q('outside') })); });
    expect(linked()).toEqual([]);
  });

  it('ignores pointer events where hover is unavailable', () => {
    mockMedia(['(hover: none)']);
    fire('row-a', 'pointerover');
    expect(linked()).toEqual([]);
  });

  it('ignores touch pointers even where hover is reported', () => {
    fire('row-a', 'pointerover', { pointerType: 'touch' });
    expect(linked()).toEqual([]);
  });

  it('links for a pen pointer', () => {
    fire('row-a', 'pointerover', { pointerType: 'pen' });
    expect(root().dataset.linking).toBe('row');
  });

  it('ignores a focus that is not focus-visible (a tap)', () => {
    stubFocusVisible(false);
    focusIn('row-btn');
    expect(linked()).toEqual([]);
  });

  it('clears when the linked row is removed and the pointer lands on a non-source', () => {
    fire('row-a', 'pointerover');
    act(() => { q('row-a').remove(); });
    fire('outside', 'pointerover');
    expect(root().dataset.linking).toBeUndefined();
    expect(linked()).toEqual([]);
  });

  it('clears on a non-source focusin after the focused row is removed', () => {
    stubFocusVisible(true);
    focusIn('row-btn');
    act(() => { q('row-a').remove(); });
    focusIn('outside');
    expect(root().dataset.linking).toBeUndefined();
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

describe('useLinkedHighlight when the root appears later', () => {
  it('attaches once the workspace element mounts', () => {
    let reveal;
    function Late() {
      const [rootEl, setRootEl] = useState(null);
      const [shown, setShown] = useState(false);
      reveal = () => setShown(true);
      useLinkedHighlight(rootEl);
      return shown ? (
        <div ref={setRootEl} id="late-root">
          <li id="late-row" data-file-id="a" data-link-row />
          <div id="late-page" data-file-id="a" />
        </div>
      ) : null;
    }
    const lateHost = document.createElement('div');
    document.body.appendChild(lateHost);
    act(() => render(<Late />, lateHost));
    act(() => reveal());
    act(() => {
      const event = new MouseEvent('pointerover', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: 'mouse' });
      document.getElementById('late-row').dispatchEvent(event);
    });
    expect(document.getElementById('late-root').dataset.linking).toBe('row');
    expect(document.getElementById('late-page').hasAttribute('data-linked')).toBe(true);
    act(() => render(null, lateHost));
    lateHost.remove();
  });
});
