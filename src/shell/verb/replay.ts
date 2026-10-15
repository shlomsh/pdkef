// A verb replays by easing back along its own path, then playing as on load.
// Rewinding at a negative rate avoids the jump a cancel() would make.

export interface AnimationLike {
  playState: string;
  currentTime: CSSNumberish | null;
  finished: Promise<unknown>;
  updatePlaybackRate(rate: number): void;
  play(): void;
}

const REWIND_RATE = -2;

const settled = (animations: AnimationLike[]) =>
  Promise.all(animations.map((a) => a.finished)).catch(() => {
    // expected: a cancelled animation (the page re-rendered) rejects; nothing is left to wait for
  });

/** Returns a trigger: rewind everything, then play forward; ignored while a replay runs. */
export function createReplayer(getAnimations: () => AnimationLike[]): () => void {
  let busy = false;
  return () => {
    const all = getAnimations();
    if (busy || all.length === 0 || all.some((a) => a.playState === 'running')) return;
    busy = true;
    // An animation already at its start has nothing to rewind (play() at a negative rate would seek to its end).
    const back = all.filter((a) => Number(a.currentTime ?? 0) > 0);
    back.forEach((a) => {
      a.updatePlaybackRate(REWIND_RATE);
      a.play();
    });
    void settled(back)
      .then(() => {
        all.forEach((a) => {
          a.updatePlaybackRate(1);
          a.play();
        });
        return settled(all);
      })
      .finally(() => {
        busy = false;
      });
  };
}

/** A tap on a phone opens the picker; only a mouse or pen hovering replays. */
export const isHover = (e: { pointerType: string }) => e.pointerType !== 'touch';
