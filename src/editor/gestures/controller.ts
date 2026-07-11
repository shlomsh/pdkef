export type GestureEvent = MouseEvent | TouchEvent;

export interface GestureControllerOptions<P> {
  computePatch(event: GestureEvent): P;
  writeDOM(patch: P): void;
  commit(patch: P | undefined): void;
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
  target = window,
}: GestureControllerOptions<P>) {
  let latestPatch: P | undefined;
  let finished = false;

  const onMove = (event: GestureEvent) => {
    latestPatch = computePatch(event);
    writeDOM(latestPatch);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    target.removeEventListener('mousemove', onMove);
    target.removeEventListener('mouseup', finish);
    target.removeEventListener('touchmove', onMove);
    target.removeEventListener('touchend', finish);
    commit(latestPatch);
  };

  target.addEventListener('mousemove', onMove);
  target.addEventListener('mouseup', finish);
  target.addEventListener('touchmove', onMove, { passive: false });
  target.addEventListener('touchend', finish);

  return finish;
}
