import { useEffect } from 'preact/hooks';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';

/** How long a real fullscreen request may go unanswered before the pseudo full screen takes over. @testSeam */
export const FULLSCREEN_ANSWER_MS = 3000;

/** The request still waiting for the browser's answer (at most one at a time), and the latest one asked. */
let waiting: { abandon(): void } | null = null;
let latest: object | null = null;

const exitRealFullscreen = () =>
  Promise.resolve(document.exitFullscreen()).catch((err) => reportError('pdf_tool_run', err, 'exit_fullscreen'));

/**
 * ARCH-37: the editors' fullscreen toggle, once. Real fullscreen when the browser allows it on the
 * workspace element, otherwise a pseudo full screen the tool draws itself (`setPseudo(true)`).
 * Each tool keeps its own state for "is pseudo fullscreen" (a useState in Sign, a reducer in
 * Redact), so this takes the current value and a setter instead of owning the state.
 */
export function toggleWorkspaceFullscreen(
  workspace: HTMLElement | null,
  isPseudo: boolean,
  setPseudo: (active: boolean) => void,
): void {
  recordAction('fullscreen');
  if (isPseudo) {
    setPseudo(false);
    return;
  }
  if (document.fullscreenElement) {
    exitRealFullscreen();
  } else if (waiting) {
    // A second press while the browser has not answered is a change of mind, not a second request.
    waiting.abandon();
  } else if (workspace?.requestFullscreen && document.fullscreenEnabled !== false) {
    const promise = workspace.requestFullscreen();
    if (!promise) return;
    // Some embedded browsers never answer the request, so after a wait the tool draws its own full screen.
    // A grant that arrives after the request was given up is left again, unless a newer request owns it.
    const request = {};
    latest = request;
    let abandoned = false;
    const settle = () => {
      clearTimeout(wait);
      if (waiting === entry) waiting = null;
    };
    const entry = { abandon: () => { abandoned = true; settle(); } };
    const wait = setTimeout(() => {
      entry.abandon();
      if (workspace.isConnected !== false && !document.fullscreenElement) setPseudo(true);
    }, FULLSCREEN_ANSWER_MS);
    waiting = entry;
    promise.then(
      () => {
        settle();
        if (abandoned && latest === request && document.fullscreenElement) exitRealFullscreen();
      },
      () => {
        settle();
        // expected: requestFullscreen is optional, falls back to pseudo-fullscreen
        if (!abandoned) setPseudo(true);
      },
    );
  } else {
    setPseudo(true);
  }
}

/** Tracks real fullscreen on the workspace element, including leaving it with Esc rather than our button. */
export function useFullscreenChange(workspaceRef: { current: HTMLElement | null }, onChange: (active: boolean) => void) {
  useEffect(() => {
    const handle = () => onChange(document.fullscreenElement === workspaceRef.current);
    document.addEventListener('fullscreenchange', handle);
    return () => document.removeEventListener('fullscreenchange', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
