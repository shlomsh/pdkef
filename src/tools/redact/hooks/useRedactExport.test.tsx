import { render } from 'preact';
import { useReducer } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import useRedactExport from './useRedactExport.ts';
import { redactReducer, type RedactAction } from '../state/redactState.ts';
import { initialRedactStateFromPreferences } from '../lib/initialRedactState.ts';

describe('useRedactExport output name', () => {
  let container = document.createElement('div');
  let outputFileName = '';
  let dispatchAction: (action: RedactAction) => void = () => {};

  function Probe() {
    const [state, dispatch] = useReducer(redactReducer, undefined, initialRedactStateFromPreferences);
    dispatchAction = dispatch;
    ({ outputFileName } = useRedactExport({
      state,
      dispatch,
      setAnnouncement: () => {},
      setNeedsUnlock: () => {},
      getFileBytes: () => null,
    }));
    return null;
  }

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  function open(name: string) {
    document.body.appendChild(container);
    act(() => render(<Probe />, container));
    act(() => dispatchAction({
      type: 'FILE_INITIALIZED',
      file: new File(['x'], name, { type: 'application/pdf' }),
      restored: false,
      elements: [],
      past: [],
      carried: undefined,
      brush: { mode: 'box', size: 12 },
      activeColor: '#ffffff',
      activeBlurStrength: 0.3,
    }));
  }

  it('names the output redacted_ plus the file name before any box exists', () => {
    open('secret.pdf');
    expect(outputFileName).toBe('redacted_secret.pdf');
  });

  it('does not chain the prefix onto a name that already carries it', () => {
    open('redacted_secret.pdf');
    expect(outputFileName).toBe('redacted_secret.pdf');
  });
});
