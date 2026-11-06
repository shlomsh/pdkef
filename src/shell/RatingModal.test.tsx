import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/telemetry/errorReport.ts', () => ({ sendBeacon: vi.fn(() => true) }));
import { sendBeacon } from '#lib/telemetry/errorReport.ts';
import RatingPrompt, { resetRatingPromptForTests } from './RatingPrompt.tsx';

describe('RatingPrompt as a modal (merge, sign, highlight-pdf, redact, scan-to-pdf)', () => {
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
  const mount = (tool: 'merge' | 'compress' | 'scan-to-pdf' = 'merge', downloaded = true) =>
    act(() => render(<RatingPrompt tool={tool} downloaded={downloaded} />, container));
  const show = () => { mount(); act(() => { vi.advanceTimersByTime(1500); }); };
  const dialog = () => container.querySelector<HTMLDialogElement>('dialog');
  const button = (re: RegExp) => [...container.querySelectorAll('button')].find((b) => re.test(b.textContent ?? b.getAttribute('aria-label') ?? '') || re.test(b.getAttribute('aria-label') ?? ''));
  const star = (n: number) => button(new RegExp(`^${n} stars?$`))!;
  const type = (text: string) => {
    const box = container.querySelector<HTMLTextAreaElement>('textarea')!;
    act(() => { box.value = text; box.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const events = () => vi.mocked(sendBeacon).mock.calls.map(([e]) => e as { name: string; properties: Record<string, unknown> });

  it('opens a modal dialog after the download delay, and not before', () => {
    mount();
    expect(dialog()).toBeNull();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(dialog()?.open).toBe(true);
    expect(dialog()?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(container.querySelectorAll('button[aria-label$="star"], button[aria-label$="stars"]')).toHaveLength(5);
  });

  it('asks in the dialog on Scan too', () => {
    mount('scan-to-pdf');
    act(() => { vi.advanceTimersByTime(1500); });
    expect(dialog()?.open).toBe(true);
  });

  it('keeps the quiet inline row for a tool outside the five', () => {
    mount('compress');
    act(() => { vi.advanceTimersByTime(1500); });
    expect(dialog()).toBeNull();
    expect(container.querySelector('[role="group"]')).not.toBeNull();
  });

  it('Not now closes it, sends nothing, and the question does not come back', () => {
    show();
    act(() => button(/not now/i)!.click());
    expect(dialog()).toBeNull();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(localStorage.getItem('pdkef:rated:merge')).toBeNull();
    expect(Number(localStorage.getItem('pdkef:rating-asked-at'))).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(dialog()).toBeNull();
  });

  it('Escape (the dialog cancel event) closes it like Not now', () => {
    show();
    act(() => { dialog()!.dispatchEvent(new Event('cancel', { cancelable: true })); });
    expect(dialog()).toBeNull();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('five stars sends the rating at once and says thanks with share and star links', () => {
    show();
    act(() => star(5).click());
    expect(events().map((e) => e.name)).toEqual(['tool_rating']);
    expect(events()[0].properties).toEqual({ tool: 'merge', stars: 5 });
    expect(localStorage.getItem('pdkef:rated:merge')).not.toBeNull();
    expect(container.textContent).toMatch(/Share/);
    expect(container.querySelector('a[href="https://github.com/shlomsh/pdkef"]')).not.toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    act(() => button(/^done$/i)!.click());
    expect(dialog()).toBeNull();
  });

  it.each([1, 2, 3, 4])('%i stars asks what happened and sends nothing until there is a real reason', (n) => {
    show();
    act(() => star(n).click());
    expect(sendBeacon).not.toHaveBeenCalled();
    const send = button(/^send$/i) as HTMLButtonElement;
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(send.disabled).toBe(true);
    type('   ');
    expect((button(/^send$/i) as HTMLButtonElement).disabled).toBe(true);
    type('Too short');
    expect((button(/^send$/i) as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('A sentence or two is plenty');
    act(() => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(sendBeacon).not.toHaveBeenCalled();
    type('The page order came out wrong');
    expect((button(/^send$/i) as HTMLButtonElement).disabled).toBe(false);
    act(() => button(/^send$/i)!.click());
    expect(events().map((e) => e.name).sort()).toEqual(['tool_rating', 'tool_rating_comment']);
    expect(events().find((e) => e.name === 'tool_rating')!.properties).toEqual({ tool: 'merge', stars: n });
    expect(events().find((e) => e.name === 'tool_rating_comment')!.properties).toEqual({ tool: 'merge', stars: n, comment: 'The page order came out wrong' });
    expect(localStorage.getItem('pdkef:rated:merge')).not.toBeNull();
    act(() => button(/^done$/i)!.click());
    expect(dialog()).toBeNull();
  });

  it('a low rating can still be walked away from: nothing is sent or remembered as rated', () => {
    show();
    act(() => star(2).click());
    type('half written');
    act(() => button(/not now/i)!.click());
    expect(dialog()).toBeNull();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(localStorage.getItem('pdkef:rated:merge')).toBeNull();
  });

  it('a send that cannot go keeps the words and says so, and sends no rating', () => {
    show();
    act(() => star(3).click());
    type('It was slow on my phone today');
    vi.mocked(sendBeacon).mockReturnValue(false);
    act(() => button(/^send$/i)!.click());
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('It was slow on my phone today');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(localStorage.getItem('pdkef:rated:merge')).toBeNull();
    vi.mocked(sendBeacon).mockReturnValue(true);
  });
});
