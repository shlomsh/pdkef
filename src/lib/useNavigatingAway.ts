import { useEffect, useState } from 'preact/hooks';

/**
 * `useState(false)` for a flag that means "a navigation away from this page is
 * under way", and nothing else. It clears itself the moment the page is shown
 * again, which plain `useState` cannot do.
 *
 * Coming back is not a fresh load. The browser restores the page it froze when
 * we navigated away, island state and all (bfcache), so a flag set on the way
 * out comes back with it - and every one of these flags disables the control
 * that set it, to keep a second click from starting a second navigation. On
 * the home page that meant the launcher came back with every recent tile, the
 * picker and the drop target dead, the picker reading "Opening..." forever,
 * and no second document openable at all (reported 2026-09-22 on iOS, exactly:
 * open a document, go back, tap another one). On a tool page the same freeze
 * leaves "Compress it" / "Sign it" greyed out for good. A flag that only ever
 * means "we are leaving" cannot still be true on a page that is being shown,
 * so clearing it here is not a workaround for the restore, it is the flag's
 * own definition.
 *
 * `pageshow` is unconditional rather than gated on `event.persisted`: a fresh
 * load has nothing to clear, so reading the flag would only add a browser
 * detail to depend on for no change in behaviour. Work still in flight is not
 * at risk either. `pageshow` fires when the document is shown, and the
 * document is already showing while a hand-off awaits its export or parks its
 * bytes - the event cannot arrive in the middle of that.
 *
 * Callers still clear it themselves when a navigation fails before it starts
 * (a failed export, a store that would not take the file); this only covers
 * the case where it succeeded and the person came back.
 */
export function useNavigatingAway() {
  const state = useState(false);
  const setNavigatingAway = state[1];
  useEffect(() => {
    const shown = () => setNavigatingAway(false);
    window.addEventListener('pageshow', shown);
    return () => window.removeEventListener('pageshow', shown);
  }, [setNavigatingAway]);
  return state;
}
