import { useEffect, useState } from 'preact/hooks';

/**
 * `useState(false)` for a flag that means "a navigation away from this page is
 * under way", and nothing else. It clears itself when the page comes back from
 * the browser's back/forward cache, which plain `useState` cannot do.
 *
 * Coming back is not a fresh load: the browser restores the page it froze on
 * the way out, island state and all, so a flag set on the way out comes back
 * set - and every one of these flags disables the control that set it, to keep
 * a second click from starting a second navigation. A flag that only ever
 * means "we are leaving" cannot still be true on a page that has been brought
 * back, so clearing it here is the flag's own definition rather than a
 * workaround for the restore. The report it fixes, and the guard that pins it,
 * are in `.claude/rules/tools-and-shell.md`.
 *
 * `event.persisted` is the restore, and gating on it matters: `pageshow` also
 * fires on an ordinary load, *after* the `load` event, which is well after a
 * `client:load` island became interactive. Clearing on that one would drop the
 * flag out from under a hand-off still reading a file or parking its bytes,
 * and a second click could then race it.
 *
 * A caller whose navigation can fail before it starts (a failed export, a
 * store that would not take the file) still clears the flag itself; this only
 * covers the case where it succeeded and the person came back.
 */
export function useNavigatingAway() {
  const state = useState(false);
  const setNavigatingAway = state[1];
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setNavigatingAway(false);
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, [setNavigatingAway]);
  return state;
}
