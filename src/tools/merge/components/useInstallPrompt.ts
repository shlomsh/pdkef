import { useCallback, useEffect } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import { isIOSDevice } from '../../../lib/platform.ts';
import type { MergeAction, MergeState, BeforeInstallPromptEvent } from '../state/mergeState.ts';
import type { PreparedStatus } from './usePreparedMerge.ts';

/* MERGE-17: the one quiet line after the first result in this browser. The
   flag is set the moment the line is shown, so it never returns. */
const FIRST_RESULT_KEY = 'pdf-toolkit:merge:first-result-seen';

function firstResultSeen(): boolean {
  try {
    return localStorage.getItem(FIRST_RESULT_KEY) === '1';
  } catch {
    // expected: blocked localStorage, treated as already seen
    return true;
  }
}

function markFirstResultSeen() {
  try {
    localStorage.setItem(FIRST_RESULT_KEY, '1');
  } catch {
    // expected: blocked localStorage, the line just shows again next time
  }
}

/** MERGE-17: the install line after the first result, and the browser's own
 * install prompt if it offers one. */
export function useInstallPrompt(
  state: Pick<MergeState, 'showInstallLine' | 'installPrompt'>,
  dispatch: Dispatch<MergeAction>,
  preparedStatus: PreparedStatus,
) {
  const { showInstallLine, installPrompt } = state;

  // Read the platform in an effect, never in render (see platform.ts).
  useEffect(() => {
    dispatch({ type: 'PLATFORM_DETECTED', onIos: isIOSDevice(typeof navigator === 'undefined' ? null : navigator) });
    const onPrompt = (event: Event) => {
      event.preventDefault();
      dispatch({ type: 'INSTALL_PROMPT_OFFERED', prompt: event as BeforeInstallPromptEvent });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [dispatch]);

  useEffect(() => {
    if (preparedStatus !== 'ready' || showInstallLine || firstResultSeen()) return;
    markFirstResultSeen();
    dispatch({ type: 'INSTALL_LINE_SHOWN' });
  }, [preparedStatus, showInstallLine, dispatch]);

  const requestInstall = useCallback(() => {
    const prompt = installPrompt;
    dispatch({ type: 'INSTALL_PROMPT_USED' });
    // expected: the install prompt is an optional browser API and the person may dismiss it
    prompt?.prompt().catch(() => {});
  }, [installPrompt, dispatch]);

  return { requestInstall };
}
