import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
import { FILE_OPENED_EVENT, FILE_OPENED_KEY } from '#lib/appUpdate/engagement.ts';
import { useFileAccepted } from './useFileAccepted.ts';

vi.mock('#lib/telemetry/productAnalytics.ts', () => ({ reportToolLifecycleEvent: vi.fn() }));

type Props = Parameters<typeof useFileAccepted>[0];

let host: HTMLDivElement;

function Probe(props: Props) {
  useFileAccepted(props);
  return null;
}

const mount = (props: Props) => act(() => { render(<Probe {...props} />, host); });
const pdf = (name: string) => new File([''], name, { type: 'application/pdf' });

// The real engagement module runs: marking a file opened is what it leaves in storage and the event it tells the page.
const opened = () => localStorage.getItem(FILE_OPENED_KEY) === '1';
let announced = 0;
const onOpened = () => { announced += 1; };

describe('useFileAccepted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    announced = 0;
    window.addEventListener(FILE_OPENED_EVENT, onOpened);
    host = document.createElement('div');
  });
  afterEach(() => {
    render(null, host);
    window.removeEventListener(FILE_OPENED_EVENT, onOpened);
  });

  it('marks the file opened and reports once when files first appear', () => {
    const a = pdf('a.pdf');
    mount({ analyticsTool: 'merge', hasFiles: false, file: null, multiple: false });
    expect(opened()).toBe(false);
    expect(announced).toBe(0);
    mount({ analyticsTool: 'merge', hasFiles: true, file: a, multiple: false });
    mount({ analyticsTool: 'merge', hasFiles: true, file: a, multiple: false });
    expect(opened()).toBe(true);
    expect(announced).toBeGreaterThan(0);
    expect(reportToolLifecycleEvent).toHaveBeenCalledTimes(1);
    expect(reportToolLifecycleEvent).toHaveBeenCalledWith('tool_file_accepted', 'merge');
  });

  it('marks even without an analytics tool, and reports nothing', () => {
    mount({ analyticsTool: undefined, hasFiles: true, file: pdf('a.pdf'), multiple: false });
    expect(opened()).toBe(true);
    expect(announced).toBeGreaterThan(0);
    expect(reportToolLifecycleEvent).not.toHaveBeenCalled();
  });

  it('reports again when a single-file tool replaces its file', () => {
    mount({ analyticsTool: 'merge', hasFiles: true, file: pdf('a.pdf'), multiple: false });
    mount({ analyticsTool: 'merge', hasFiles: true, file: pdf('b.pdf'), multiple: false });
    expect(reportToolLifecycleEvent).toHaveBeenCalledTimes(2);
  });

  it('does not report a changed file in a multiple-file tool', () => {
    mount({ analyticsTool: 'merge', hasFiles: true, file: pdf('a.pdf'), multiple: true });
    mount({ analyticsTool: 'merge', hasFiles: true, file: pdf('b.pdf'), multiple: true });
    expect(reportToolLifecycleEvent).toHaveBeenCalledTimes(1);
  });

  it('does nothing with no files', () => {
    mount({ analyticsTool: 'merge', hasFiles: false, file: null, multiple: false });
    expect(opened()).toBe(false);
    expect(announced).toBe(0);
    expect(reportToolLifecycleEvent).not.toHaveBeenCalled();
  });
});
