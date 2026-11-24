import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useReducer } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useInstallPrompt } from './useInstallPrompt.ts';
import { initialMergeState, mergeReducer, type BeforeInstallPromptEvent, type MergeState } from '../state/mergeState.ts';
import type { PreparedStatus } from './usePreparedMerge.ts';

describe('useInstallPrompt', () => {
  let container: HTMLElement;
  let state: MergeState;
  let requestInstall: () => void;

  function Probe({ status }: { status: PreparedStatus }) {
    const [current, dispatch] = useReducer(mergeReducer, initialMergeState({ draftHint: false, addPageNumbers: false }));
    state = current;
    ({ requestInstall } = useInstallPrompt(current, dispatch, status));
    return null;
  }
  const mount = (status: PreparedStatus) => act(() => render(<Probe status={status} />, container));
  const offerInstall = () => {
    let prompted = 0;
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => { prompted += 1; return Promise.resolve(); },
    }) satisfies BeforeInstallPromptEvent;
    act(() => { window.dispatchEvent(event); });
    return { event, prompted: () => prompted };
  };

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  it('shows the install line once the first result is ready, and marks the browser as having seen it', () => {
    mount('pending');
    expect(state.showInstallLine).toBe(false);
    expect(localStorage.getItem('pdf-toolkit:merge:first-result-seen')).toBeNull();
    mount('ready');
    expect(state.showInstallLine).toBe(true);
    expect(localStorage.getItem('pdf-toolkit:merge:first-result-seen')).toBe('1');
  });

  it('never shows the line again in a browser that has seen it', () => {
    mount('ready');
    expect(state.showInstallLine).toBe(true);
    act(() => render(null, container));
    mount('ready');
    expect(state.showInstallLine).toBe(false);
  });

  it('keeps the browser install prompt for later and stops the browser showing its own', () => {
    mount('idle');
    const { event } = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(state.installPrompt).toBe(event);
  });

  it('runs the saved prompt once on request and forgets it', () => {
    mount('idle');
    const offered = offerInstall();
    act(() => requestInstall());
    expect(offered.prompted()).toBe(1);
    expect(state.installPrompt).toBeNull();
  });

  it('stops listening for the install prompt once unmounted', () => {
    mount('idle');
    act(() => render(null, container));
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
