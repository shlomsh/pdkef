import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/errorReport.ts', () => ({ sendBeacon: vi.fn(() => true) }));
import { sendBeacon } from '../lib/errorReport.ts';
import RatingPrompt, { useDownloaded } from './RatingPrompt.tsx';
import { recordAction } from '../lib/actionTrail.ts';

describe('RatingPrompt', () => {
  let container: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(sendBeacon).mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    render(null, container);
    container.remove();
  });
  const mount = (downloaded: boolean) => act(() => render(<RatingPrompt tool="compress" downloaded={downloaded} />, container));
  const buttons = () => [...container.querySelectorAll('button')];

  it('renders nothing until a download happened', () => {
    mount(false);
    expect(container.innerHTML).toBe('');
  });

  it('shows five labelled star buttons after a download', () => {
    mount(true);
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual(['1 star', '2 stars', '3 stars', '4 stars', '5 stars']);
  });

  it('one tap sends once, remembers, and swaps to thanks', () => {
    mount(true);
    act(() => buttons()[3].click());
    expect(sendBeacon).toHaveBeenCalledWith({ name: 'tool_rating', properties: { tool: 'compress', stars: 4 } });
    expect(localStorage.getItem('pdkef:rated:compress')).toBe('1');
    expect(container.textContent).toBe('Thanks, that helps.');
    expect(buttons()).toHaveLength(0);
  });

  it('stays hidden for a device that already rated', () => {
    localStorage.setItem('pdkef:rated:compress', '1');
    mount(true);
    expect(container.innerHTML).toBe('');
  });

  it('useDownloaded flips on a recorded download only', () => {
    function Probe() { return <i>{String(useDownloaded())}</i>; }
    act(() => render(<Probe />, container));
    act(() => recordAction('add_files'));
    expect(container.textContent).toBe('false');
    act(() => recordAction('download'));
    expect(container.textContent).toBe('true');
  });
});
