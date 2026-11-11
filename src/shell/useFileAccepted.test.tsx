import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
import { markFileOpened } from '#lib/appUpdate/engagement.ts';
import { useFileAccepted } from './useFileAccepted.ts';

vi.mock('#lib/telemetry/productAnalytics.ts', () => ({ reportToolLifecycleEvent: vi.fn() }));
vi.mock('#lib/appUpdate/engagement.ts', () => ({ markFileOpened: vi.fn() }));

type Props = Parameters<typeof useFileAccepted>[0];

let host: HTMLDivElement;

function Probe(props: Props) {
  useFileAccepted(props);
  return null;
}

const mount = (props: Props) => act(() => { render(<Probe {...props} />, host); });
const pdf = (name: string) => new File([''], name, { type: 'application/pdf' });

describe('useFileAccepted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
  });
  afterEach(() => render(null, host));

  it('marks the file opened and reports once when files first appear', () => {
    const a = pdf('a.pdf');
    mount({ analyticsTool: 'merge', hasFiles: false, file: null, multiple: false });
    expect(markFileOpened).not.toHaveBeenCalled();
    mount({ analyticsTool: 'merge', hasFiles: true, file: a, multiple: false });
    mount({ analyticsTool: 'merge', hasFiles: true, file: a, multiple: false });
    expect(markFileOpened).toHaveBeenCalled();
    expect(reportToolLifecycleEvent).toHaveBeenCalledTimes(1);
    expect(reportToolLifecycleEvent).toHaveBeenCalledWith('tool_file_accepted', 'merge');
  });

  it('marks even without an analytics tool, and reports nothing', () => {
    mount({ analyticsTool: undefined, hasFiles: true, file: pdf('a.pdf'), multiple: false });
    expect(markFileOpened).toHaveBeenCalled();
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
    expect(markFileOpened).not.toHaveBeenCalled();
    expect(reportToolLifecycleEvent).not.toHaveBeenCalled();
  });
});
