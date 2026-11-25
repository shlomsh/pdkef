import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLinkedHighlight, useMergeMoment, linkKind } from './useLinkedHighlight.ts';

let host: HTMLDivElement;
let moment: () => void;

function Harness() {
  const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
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

const q = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
// jsdom has no PointerEvent, so the pointer type rides on a MouseEvent.
const fire = (id: string, type: string, { pointerType = 'mouse', ...init }: MouseEventInit & { pointerType?: string } = {}) => act(() => {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  q(id).dispatchEvent(event);
});
const focusIn = (id: string) => act(() => { q(id).dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });

// jsdom answers :focus-visible for real: true once an element holds focus, false for an element that does not.
const focusVisibly = (id: string) => act(() => { q(id).focus(); });
const linked = () => [...document.querySelectorAll('[data-linked]')].map((el) => el.id).sort();
const root = () => host.firstElementChild as HTMLElement;

// Forced: jsdom has no matchMedia (setup.js installs one that always matches); each test needs its own answers.
function mockMedia(matches: string[]) {
  // Cast 1 of 1: only matches and media are read, a full MediaQueryList has no smaller type.
  window.matchMedia = vi.fn((query: string) => ({ matches: matches.includes(query), media: query }) as unknown as MediaQueryList);
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
  document.documentElement.removeAttribute('data-page-dragging');
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

  it('clears the link of a source that left the DOM when the next event is ignored', () => {
    fire('row-a', 'pointerover');
    fire('page-a1', 'pointerover');
    act(() => { q('page-a1').remove(); });
    fire('page-b1', 'pointerover', { pointerType: 'touch' });
    expect(linked()).toEqual([]);
    expect(root().dataset.linking).toBeUndefined();
  });

  it('moving between children of the same source keeps the link', () => {
    fire('row-a', 'pointerover');
    fire('row-a', 'pointerout', { relatedTarget: q('row-btn') });
    expect(linked()).toEqual(['page-a1', 'page-a2', 'row-a']);
  });

  it('focus links and blur clears, even where hover is unavailable', () => {
    mockMedia(['(hover: none)']);
    focusVisibly('row-btn');
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

  it('keeps the focus highlight when the pointer leaves another source', () => {
    focusVisibly('row-btn');
    fire('row-b', 'pointerover');
    expect(linked()).toEqual(['page-b1', 'row-b']);
    fire('row-b', 'pointerout', { relatedTarget: q('outside') });
    expect(linked()).toEqual(['page-a1', 'page-a2', 'row-a']);
  });

  it('ignores a focus that is not focus-visible (a tap)', () => {
    expect(q('row-btn').matches(':focus-visible')).toBe(false);
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
    focusVisibly('row-btn');
    expect(root().dataset.linking).toBe('row');
    act(() => { q('row-a').remove(); });
    focusIn('outside');
    expect(root().dataset.linking).toBeUndefined();
    expect(linked()).toEqual([]);
  });

  it('ignores everything while a page is being dragged', () => {
    document.documentElement.setAttribute('data-page-dragging', '');
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
    let reveal: () => void = () => {};
    function Late() {
      const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
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
      document.getElementById('late-row')?.dispatchEvent(event);
    });
    expect((document.getElementById('late-root') as HTMLElement).dataset.linking).toBe('row');
    expect(document.getElementById('late-page')?.hasAttribute('data-linked')).toBe(true);
    act(() => render(null, lateHost));
    lateHost.remove();
  });
});
