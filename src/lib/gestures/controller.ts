export type GestureEvent = MouseEvent | TouchEvent;

export interface GestureControllerOptions<P> {
  computePatch(event: GestureEvent): P;
  writeDOM(patch: P): void;
  commit(patch: P | undefined): void;
  /** Undo imperative preview work without committing an interrupted gesture. */
  cancel?(): void;
  target?: Window;
}

/**
 * One lifecycle for editor gestures: calculate and paint imperatively on every
 * move, then hand the last patch to application state exactly once on release.
 *
 * This deliberately owns neither element geometry nor DOM nodes. The caller
 * supplies those seams, keeping this module usable by Sign and Redact alike.
 */
export function startGesture<P>({
  computePatch,
  writeDOM,
  commit,
  cancel: onCancel,
  target = window,
}: GestureControllerOptions<P>) {
  let latestPatch: P | undefined;
  let finished = false;

  const onMove = (event: GestureEvent) => {
    // MOBI-31: a second touch point joining mid-gesture means the person
    // meant to pinch-zoom, not to keep dragging/resizing with the first
    // finger. `'touches' in event` alone is not enough to tell a real touch
    // event apart from one of Preact's synthetic mouse events, which expose
    // `touches: null` (see the same feature-detection note in
    // src/editor/gestures/pointer.ts) - `event.touches?.length` guards that.
    // This never fires for a real MouseEvent (no `touches` property at all).
    // Cancelling here - through the same `cancel` every interruption
    // (touchcancel, blur, tab hidden) already goes through - is the one
    // place every gesture consumer (drag, resize, create, CompareSlider)
    // gets this for free, rather than each caller re-deriving it inside its
    // own `computePatch`.
    if ('touches' in event && (event.touches?.length ?? 0) > 1) {
      cancel();
      return;
    }
    latestPatch = computePatch(event);
    writeDOM(latestPatch);
  };

  const cleanup = () => {
    target.removeEventListener('mousemove', onMove);
    target.removeEventListener('mouseup', finish);
    target.removeEventListener('touchmove', onMove);
    target.removeEventListener('touchend', finish);
    target.removeEventListener('touchcancel', cancel);
    target.removeEventListener('blur', cancel);
    target.document?.removeEventListener('visibilitychange', onVisibilityChange);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    cleanup();
    commit(latestPatch);
  };

  const cancel = () => {
    if (finished) return;
    finished = true;
    cleanup();
    onCancel?.();
  };

  const onVisibilityChange = () => {
    if (target.document?.visibilityState === 'hidden') cancel();
  };

  target.addEventListener('mousemove', onMove);
  target.addEventListener('mouseup', finish);
  target.addEventListener('touchmove', onMove, { passive: false });
  target.addEventListener('touchend', finish);
  target.addEventListener('touchcancel', cancel);
  target.addEventListener('blur', cancel);
  target.document?.addEventListener('visibilitychange', onVisibilityChange);

  return cancel;
}
