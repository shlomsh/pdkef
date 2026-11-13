import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/telemetry/errorReport.ts', () => ({ sendBeacon: vi.fn(() => true) }));
import { sendBeacon } from '#lib/telemetry/errorReport.ts';
import RatingPrompt, { resetRatingPromptForTests } from './RatingPrompt.tsx';
import { hebrewShellMessages } from './shellMessages';

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
  const share = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
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
    act(() => button(/^done$/i)!.click());
    expect(dialog()).toBeNull();
  });

  it('five stars thanks, in order: filled stars, thanks, the words question with hint and signature, then the quiet share line', () => {
    show();
    act(() => star(5).click());
    const body = container.querySelector('dialog')!;
    const given = body.querySelector('[role="img"]')!;
    expect(given.getAttribute('aria-label')).toBe('5 stars');
    expect(given.querySelectorAll('svg')).toHaveLength(5);
    const thanks = body.querySelector('[role="status"]')!;
    expect(thanks.textContent).toBe('Thank you, that really helps.');
    const words = body.querySelector('form')!;
    expect(words.textContent).toContain('What would you tell a friend about it?');
    expect(words.textContent).toContain("One line is plenty. It helps the next person know what it's like.");
    expect(words.querySelector('textarea')!.getAttribute('rows')).toBe('2');
    const sign = [...body.querySelectorAll('p')].find((p) => p.textContent?.includes('I read every one.'))!;
    expect(sign.querySelector('b')!.textContent).toBe('Shlomi');
    const quiet = [...body.querySelectorAll('div')].find((d) => d.textContent?.startsWith("Know someone who'd use it?"))!;
    expect(quiet.querySelector('a[href="https://github.com/shlomsh/pdkef"]')).not.toBeNull();
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(given, thanks)).toBe(true);
    expect(before(thanks, words)).toBe(true);
    expect(before(words, sign)).toBe(true);
    expect(before(sign, quiet)).toBe(true);
  });

  it('five stars thanks reads in Hebrew with the Hebrew strings', () => {
    act(() => render(<RatingPrompt tool="merge" downloaded messages={hebrewShellMessages} />, container));
    act(() => { vi.advanceTimersByTime(1500); });
    act(() => [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === hebrewShellMessages.ratingStarOther.replace('{count}', '5'))!.click());
    const text = container.textContent ?? '';
    expect(text).toContain('תודה רבה, זה עוזר מאוד.');
    expect(text).toContain('מה הייתם מספרים עליו לחבר?');
    expect(text).toContain('שורה אחת מספיקה. היא עוזרת למי שיגיע אחריכם לדעת איך זה.');
    expect(text).toContain('אני קורא כל אחת.');
    expect(text).toContain('שלומי');
    expect(text).toContain('מכירים מישהו שיוכל להשתמש בזה?');
  });

  it('a low rating thanks has no stars group, words box or share line', () => {
    show();
    act(() => star(2).click());
    type('The page order came out wrong');
    act(() => button(/^send$/i)!.click());
    expect(container.textContent).toContain("Thank you for telling me. I'll use it to make PDkef better.");
    expect(container.querySelector('dialog [role="img"]')).toBeNull();
    expect(container.textContent).not.toContain("Know someone who'd use it?");
    expect(container.textContent).not.toContain('What would you tell a friend');
  });

  it('five stars may leave words: Send waits for some, and they stay private unless the box is ticked', () => {
    show();
    act(() => star(5).click());
    expect((button(/^send$/i) as HTMLButtonElement).disabled).toBe(true);
    type('Saved my afternoon');
    expect(share().checked).toBe(false);
    act(() => button(/^send$/i)!.click());
    expect(events().at(-1)).toEqual({ name: 'tool_rating_comment', properties: { tool: 'merge', stars: 5, comment: 'Saved my afternoon' } });
    expect(container.querySelector('textarea')).toBeNull();
    expect(button(/^send$/i)).toBeUndefined();
    expect(container.textContent).toContain('Got it, thank you.');
  });

  it('five stars with the box ticked sends the OK to show the words', () => {
    show();
    act(() => star(5).click());
    type('Saved my afternoon');
    act(() => share().click());
    act(() => button(/^send$/i)!.click());
    expect(events().at(-1)).toEqual({ name: 'tool_rating_comment', properties: { tool: 'merge', stars: 5, comment: 'Saved my afternoon', share: true } });
  });

  it('Done with words typed but not sent sends only the stars', () => {
    show();
    act(() => star(5).click());
    type('Half a thought');
    act(() => button(/^done$/i)!.click());
    expect(events().map((e) => e.name)).toEqual(['tool_rating']);
  });

  it('five stars words that cannot go keep the text and say so', () => {
    show();
    act(() => star(5).click());
    type('Saved my afternoon');
    vi.mocked(sendBeacon).mockReturnValue(false);
    act(() => button(/^send$/i)!.click());
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Saved my afternoon');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    vi.mocked(sendBeacon).mockReturnValue(true);
  });

  it('a low rating points a bug to GitHub issues and an idea to Discussions, in a new tab', () => {
    show();
    act(() => star(2).click());
    const bug = container.querySelector<HTMLAnchorElement>('a[href="https://github.com/shlomsh/pdkef/issues/new?template=bug_report.md"]');
    const idea = container.querySelector<HTMLAnchorElement>('a[href="https://github.com/shlomsh/pdkef/discussions/categories/ideas"]');
    expect(bug?.textContent).toBe('Report a bug');
    expect(idea?.textContent).toBe('Suggest an idea');
    expect(bug?.target).toBe('_blank');
    expect(idea?.target).toBe('_blank');
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
