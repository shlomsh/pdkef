import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { playPlan } from '../lib/lampEntrance/lampPlayer.ts';
import { measureBefore, partsIn, planAfter, restoreCordFocus, type Before } from '../lib/lampEntrance/lampDom.ts';
import type { Rect } from '../lib/lampEntrance/geometry.ts';

/** How long a press waits for the view to change (real fullscreen answers later) before it is forgotten. */
const PRESS_EXPIRES_MS = 1500;

/** The capsule leaves a copy of itself behind to fade out over the closing pill: it is unmounted before the view changes. */
function leaveGhost(ws: HTMLElement) {
  const capsule = ws.querySelector('[data-lamp-part="capsule"] [role="toolbar"]');
  const ghost = ws.querySelector('[data-lamp-part="ghost"]');
  if (capsule && ghost) ghost.replaceChildren(capsule.cloneNode(true));
}
const clearGhost = (ws: HTMLElement) => ws.querySelector('[data-lamp-part="ghost"]')?.replaceChildren();

/**
 * The Reading lamp's way in and out (R-lamp "Pull the cord"). `toggle` stands in for the lamp's own toggle: it measures
 * what is on screen, flips the view, and when the new view has laid out (a layout effect, so before it paints) plays the
 * choreography with the Web Animations API on the DOM. No animation state lives in Preact. A press while one is under
 * way, or waiting for the view to change, is ignored; the view changing by itself (Esc) cancels the one under way and
 * plays the other way. Whatever happens, ending or cancelling hands the nodes back to their stylesheets: the final state.
 * The plan is made a microtask after the view changes, so the scroll anchoring has settled when the new boxes are measured.
 */
export function useLampEntrance({ workspaceRef, fullscreen, toggleLamp }: { workspaceRef: { current: HTMLElement | null }; fullscreen: boolean; toggleLamp(): void }) {
  const press = useRef<{ before: Before; timer: ReturnType<typeof setTimeout> } | null>(null);
  const run = useRef<{ cancel(): void } | null>(null);
  const was = useRef(fullscreen);
  const capsule = useRef<Rect | null>(null);
  // Focus goes back to the cord only for a keyboard reader: moved by script after a click or tap, it would light the
  // cord's focus ring for someone who never pressed Tab.
  const byKeyboard = useRef(true);
  useEffect(() => {
    const pointer = () => { byKeyboard.current = false; };
    const key = () => { byKeyboard.current = true; };
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', pointer, true); window.removeEventListener('keydown', key, true); };
  }, []);

  useLayoutEffect(() => {
    if (was.current === fullscreen) return;
    was.current = fullscreen;
    const ws = workspaceRef.current;
    const pressed = press.current;
    if (pressed) clearTimeout(pressed.timer);
    press.current = null;
    run.current?.cancel();
    if (!ws) return;
    const direction = fullscreen ? 'enter' : 'exit';
    // The new view has laid out by now; the plan is made a microtask later, still before it paints, so the parents'
    // layout effects (the lamp anchor's scroll) have settled by the time the boxes are measured.
    let cancelled = false;
    let inner: { cancel(): void } | null = null;
    const handle = { cancel: () => { cancelled = true; inner?.cancel(); } };
    run.current = handle;
    queueMicrotask(() => {
      if (cancelled) return;
      const { plan, capsule: pill } = planAfter(direction, ws, pressed?.before ?? null, capsule.current);
      capsule.current = pill;
      // The ghost is only for the full exit, which fades it; any other plan (or none) leaves it nothing to do.
      if (!plan.tracks.some((track) => track.part === 'ghost')) clearGhost(ws);
      const current = playPlan(plan, partsIn(ws));
      inner = current;
      if (!current) {
        if (run.current === handle) run.current = null;
        clearGhost(ws);
        if (direction === 'exit' && byKeyboard.current) restoreCordFocus(ws);
        return;
      }
      void current.finished.then(() => { // reason: playPlan's finished never rejects; it settles on end and on cancel
        if (run.current === handle) run.current = null;
        clearGhost(ws);
        if (direction === 'exit' && !cancelled && byKeyboard.current) restoreCordFocus(ws);
      });
    });
  }, [workspaceRef, fullscreen]);

  useEffect(() => () => { run.current?.cancel(); }, []);

  return () => {
    const ws = workspaceRef.current;
    if (run.current || press.current || !ws) { if (!ws) toggleLamp(); return; }
    const direction = fullscreen ? 'exit' : 'enter';
    if (direction === 'exit') leaveGhost(ws);
    const timer = setTimeout(() => { press.current = null; clearGhost(ws); }, PRESS_EXPIRES_MS);
    press.current = { before: measureBefore(direction, ws), timer };
    toggleLamp();
  };
}
