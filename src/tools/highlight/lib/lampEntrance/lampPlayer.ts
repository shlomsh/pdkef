import { toKeyframes, type Part, type Plan } from './timeline.ts';

/** How long past its duration a plan may run before it is cancelled: the lamp must never be left mid-animation. */
const FAILSAFE_MS = 400;

interface LampRun {
  /** Settles when every animation has finished or been cancelled; by then the natural (final) state shows. */
  finished: Promise<void>;
  cancel(): void;
}

/**
 * Plays a plan with the Web Animations API on the DOM nodes `resolve` finds, one animation per node per track.
 * Nothing is held in component state per frame. Each animation is `fill: both`, so the first key shows at once;
 * when they are done they are cancelled, which hands every node back to its stylesheet, the lamp's final state.
 * Null when nothing was found to animate.
 */
export function playPlan(plan: Plan, resolve: (part: Part) => Element[]): LampRun | null {
  const animations: Animation[] = [];
  plan.tracks.forEach((track) => {
    const frames = toKeyframes(plan.duration, track.keys);
    resolve(track.part).forEach((el) => {
      if (typeof el.animate === 'function') animations.push(el.animate(frames, { duration: plan.duration, fill: 'both' }));
    });
  });
  if (animations.length === 0) return null;
  let failsafe: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(failsafe); animations.forEach((a) => a.cancel()); };
  failsafe = setTimeout(cancel, plan.duration + FAILSAFE_MS);
  // allSettled: a cancelled animation rejects its `finished`, and that is a normal end here.
  const finished = Promise.allSettled(animations.map((a) => a.finished)).then(cancel);
  return { finished, cancel };
}
