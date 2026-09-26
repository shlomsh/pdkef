/**
 * Fill mode (SNG-15): focus-driven editing (docs/sign-fill-mode.md, "Focus
 * decides what is edited"). This hook only wires document focus events to
 * fillFocusActions.ts's pure decision; it makes no decisions of its own.
 *
 * Capture phase, so nothing between the target and this listener can stop
 * the event first. focusout's relatedTarget is not trustworthy on iOS when
 * its own keyboard arrows move focus, so every focusout defers one tick and
 * reads document.activeElement instead - the one signal that holds on every
 * platform. When the browser moves focus directly from one fill input to the
 * next, the next one's focusin runs first (the same synchronous call that
 * raised the first one's focusout) and updates the last-seen key, so the
 * deferred check lands on a no-op: no separate "editing ended" is ever
 * dispatched between two hops.
 */
import { useEffect, useRef } from 'preact/hooks';
import { fillKeyOf } from './fillDom.ts';
import { focusActions } from './fillFocusActions.ts';
import type { SignToolAction } from '../components/SignToolContext.tsx';

export interface UseFillFocusOptions {
  /** `?next=1`, and only then; while false this hook attaches nothing. */
  enabled: boolean;
  dispatch: (action: SignToolAction) => void;
  /** An element's current text, read only for the fill input focus is leaving. */
  textOf: (elementId: string) => string | undefined;
}

export function useFillFocus({ enabled, dispatch, textOf }: UseFillFocusOptions): void {
  // The last fill key focus was on. A ref, not state: a focus move decides
  // synchronously and must never wait for a render.
  const lastKeyRef = useRef<string | null>(null);
  // Latest callbacks, read by the listeners below without making them
  // reattach every time a caller passes a new function identity.
  const dispatchRef = useRef(dispatch);
  const textOfRef = useRef(textOf);
  dispatchRef.current = dispatch;
  textOfRef.current = textOf;

  useEffect(() => {
    if (!enabled) return undefined;

    let pendingTimer = 0;

    const move = (to: string | null) => {
      const from = lastKeyRef.current;
      if (from === to) return;
      lastKeyRef.current = to;
      for (const action of focusActions({ from, to }, textOfRef.current)) dispatchRef.current(action);
    };

    // Focus entering something that is not a fill input (the element's own toolbar on
    // desktop: Bold, a colour) is not leaving the field: the session stays open so
    // the click it came from still lands. Only another fill input, or nowhere, moves.
    const onFocusIn = (event: FocusEvent) => {
      const key = fillKeyOf(event.target as Element | null);
      if (key !== null) move(key);
    };

    // Deferred, and always reading document.activeElement rather than
    // event.relatedTarget: iOS's own next/previous arrows can move focus
    // without ever setting it (docs/sign-fill-mode.md).
    const onFocusOut = () => {
      window.clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(() => {
        const active = document.activeElement;
        const key = fillKeyOf(active);
        if (key !== null) move(key);
        else if (!active || active === document.body) move(null);
      }, 0);
    };

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      window.clearTimeout(pendingTimer);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      lastKeyRef.current = null;
    };
  }, [enabled]);
}
