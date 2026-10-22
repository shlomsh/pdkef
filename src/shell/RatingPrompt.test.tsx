import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/errorReport.ts', () => ({ sendBeacon: vi.fn(() => true) }));
import { sendBeacon } from '../lib/errorReport.ts';
import RatingPrompt, { resetRatingPromptForTests, useDownloaded } from './RatingPrompt.tsx';
import { recordAction } from '../lib/actionTrail.ts';

describe('RatingPrompt', () => {
  let container: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetRatingPromptForTests();
    vi.mocked(sendBeacon).mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    vi.useRealTimers();
    render(null, container);
    container.remove();
  });
  const mount = (downloaded: boolean) => act(() => render(<RatingPrompt tool="compress" downloaded={downloaded} />, container));
  const buttons = () => [...container.querySelectorAll('button')];
  const stars = () => buttons().filter((b) => /star/.test(b.getAttribute('aria-label') ?? ''));
  const showAfterDelay = () => { mount(true); act(() => { vi.advanceTimersByTime(1500); }); };

  it('renders nothing until a download happened', () => {
    mount(false);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(container.innerHTML).toBe('');
  });

  it('appears only after the delay and marks the device asked', () => {
    mount(true);
    expect(container.innerHTML).toBe('');
    expect(localStorage.getItem('pdkef:rating-asked-at')).toBeNull();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(container.textContent).toContain('PDkef is free and open source. If it helped, a rating helps other people find it.');
    expect(stars().map((b) => b.getAttribute('aria-label'))).toEqual(['1 star', '2 stars', '3 stars', '4 stars', '5 stars']);
    expect(Number(localStorage.getItem('pdkef:rating-asked-at'))).toBeGreaterThan(0);
  });

  describe('remount on the same page', () => {
    it('shows the ask at once, without asking again', () => {
      mount(false);
      mount(true);
      act(() => { vi.advanceTimersByTime(1500); });
      expect(stars()).toHaveLength(5);
      const askedAt = localStorage.getItem('pdkef:rating-asked-at');
      act(() => render(null, container));
      expect(container.innerHTML).toBe('');
      mount(true);
      expect(stars()).toHaveLength(5);
      act(() => { vi.advanceTimersByTime(5000); });
      expect(localStorage.getItem('pdkef:rating-asked-at')).toBe(askedAt);
    });

    it('keeps the follow-up after a 5-star rating', () => {
      showAfterDelay();
      act(() => stars()[4].click());
      act(() => render(null, container));
      mount(true);
      expect(container.textContent).toContain('Thank you, that really helps');
    });

    it('a fresh instance with downloaded=false starts hidden', () => {
      showAfterDelay();
      act(() => render(null, container));
      mount(false);
      expect(container.innerHTML).toBe('');
    });
  });

  it('clears the timer on unmount', () => {
    mount(true);
    act(() => render(null, container));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(localStorage.getItem('pdkef:rating-asked-at')).toBeNull();
  });

  it('stays hidden inside the 14-day gap', () => {
    localStorage.setItem('pdkef:rating-asked-at', String(Date.now()));
    mount(true);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(container.innerHTML).toBe('');
  });

  it('a high rating sends, remembers, and offers Share and GitHub', () => {
    showAfterDelay();
    act(() => stars()[3].click());
    expect(sendBeacon).toHaveBeenCalledWith({ name: 'tool_rating', properties: { tool: 'compress', stars: 4 } });
    expect(localStorage.getItem('pdkef:rated:compress')).toBe('1');
    expect(container.textContent).toContain("Thank you, that really helps. Know someone who'd use it?");
    expect(stars()).toHaveLength(0);
    expect(buttons().map((b) => b.textContent)).toEqual(['Share']);
    const gh = container.querySelector('a') as HTMLAnchorElement;
    expect(gh.textContent).toBe('Star it on GitHub');
    expect(gh.getAttribute('href')).toBe('https://github.com/shlomsh/pdkef');
    expect(gh.target).toBe('_blank');
    expect(gh.rel).toBe('noopener noreferrer');
  });

  // On iPhone the tap that rated also landed on "Star it on GitHub", which appeared under the finger.
  it('ignores a follow-up activation in the first half second, then lets it through', () => {
    showAfterDelay();
    act(() => stars()[4].click());
    const click = () => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      (container.querySelector('a') as HTMLAnchorElement).dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(click()).toBe(true);
    act(() => { vi.advanceTimersByTime(600); });
    expect(click()).toBe(false);
  });

  it('a low rating offers the issues link', () => {
    showAfterDelay();
    act(() => stars()[1].click());
    expect(sendBeacon).toHaveBeenCalledWith({ name: 'tool_rating', properties: { tool: 'compress', stars: 2 } });
    expect(container.textContent).toContain("Thank you. If something went wrong, I'd love to hear about it.");
    const a = container.querySelector('a') as HTMLAnchorElement;
    expect(a.textContent).toBe('Tell me on GitHub');
    expect(a.getAttribute('href')).toBe('https://github.com/shlomsh/pdkef/issues');
    expect(a.rel).toBe('noopener noreferrer');
    expect(buttons()).toHaveLength(0);
  });

  describe('Share', () => {
    const nav = navigator as unknown as Record<string, unknown>;
    afterEach(() => { delete nav.share; delete nav.clipboard; document.head.querySelectorAll('link[rel=canonical]').forEach((l) => l.remove()); });
    const tapShare = () => {
      showAfterDelay();
      act(() => stars()[4].click());
      act(() => { vi.advanceTimersByTime(600); }); // past the follow-up's settle window
      return act(async () => { buttons()[0].click(); });
    };

    it('uses navigator.share with the canonical url', async () => {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = 'https://pdkef.com/compress/';
      document.head.appendChild(link);
      document.title = 'Compress PDF';
      const share = vi.fn(() => Promise.resolve());
      nav.share = share;
      await tapShare();
      expect(share).toHaveBeenCalledWith({ title: 'Compress PDF', url: 'https://pdkef.com/compress/' });
    });

    it('swallows a rejected share', async () => {
      nav.share = vi.fn(() => Promise.reject(new DOMException('x', 'AbortError')));
      await expect(tapShare()).resolves.toBeUndefined();
      expect(buttons().map((b) => b.textContent)).toEqual(['Share']);
    });

    it('copies the link when share is missing', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      nav.clipboard = { writeText };
      await tapShare();
      expect(writeText).toHaveBeenCalledWith(location.origin + location.pathname);
      expect(buttons()[0].textContent).toBe('Link copied');
    });

    it('falls back to a plain link when the clipboard fails too', async () => {
      nav.clipboard = { writeText: vi.fn(() => Promise.reject(new Error('no'))) };
      await tapShare();
      const links = [...container.querySelectorAll('a')];
      expect(links[0].getAttribute('href')).toBe(location.origin + location.pathname);
      expect(buttons()).toHaveLength(0);
    });
  });

  it('useDownloaded flips on a recorded download only', () => {
    function Probe() { return <i>{String(useDownloaded())}</i>; }
    act(() => render(<Probe />, container));
    act(() => recordAction('add_files'));
    expect(container.textContent).toBe('false');
    act(() => recordAction('download'));
    expect(container.textContent).toBe('true');
  });

  // On iPhone, Download replaces the page with the PDF; Share PDF is how a phone takes the result.
  it('useDownloaded also flips on a completed share', () => {
    function Probe() { return <i>{String(useDownloaded())}</i>; }
    act(() => render(<Probe />, container));
    act(() => recordAction('share'));
    expect(container.textContent).toBe('true');
  });
});
