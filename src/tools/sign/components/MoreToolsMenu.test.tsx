import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoreToolsMenu, { MORE_TOOLS, isMoreTool, moreLabelFor, type MoreTool } from './MoreToolsMenu.tsx';
import { englishSignMessages, hebrewSignMessages } from '../messages';
import type { SignToolType } from '#editor/model/editorModel.ts';

const t = englishSignMessages;
const HREF = 'https://github.com/example/issues/new?title=x';

describe('MoreToolsMenu helpers', () => {
  it('lists the five tools behind More and recognises only those', () => {
    expect([...MORE_TOOLS]).toEqual(['highlight', 'comment', 'ellipse', 'rectangle', 'line']);
    expect(isMoreTool('ellipse')).toBe(true);
    expect(isMoreTool('text')).toBe(false);
    expect(isMoreTool(null)).toBe(false);
    expect(isMoreTool(undefined)).toBe(false);
  });

  it('names the armed tool, or More when none is', () => {
    expect(moreLabelFor(null, t)).toBe(t.moreButton);
    expect(moreLabelFor('highlight', t)).toBe(t.highlightLabel);
    expect(moreLabelFor('comment', t)).toBe(t.commentToolLabel);
    expect(moreLabelFor('ellipse', t)).toBe(t.ellipseLabel);
    expect(moreLabelFor('rectangle', t)).toBe(t.rectangleLabel);
    expect(moreLabelFor('line', t)).toBe(t.lineLabel);
  });
});

describe('MoreToolsMenu', () => {
  let container: HTMLDivElement;

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.body.innerHTML = '';
  });

  function setup(props: Partial<Parameters<typeof MoreToolsMenu>[0]> = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onPick = vi.fn();
    const onLock = vi.fn();
    const selectedTool: SignToolType | null = null;
    act(() => {
      render(
        <MoreToolsMenu t={t} selectedTool={selectedTool} toolLocked={false} onPick={onPick} onLock={onLock} feedbackHref={HREF} {...props} />,
        container,
      );
    });
    const trigger = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    const open = async () => { await act(async () => { trigger().click(); }); };
    const items = () => Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    return { onPick, onLock, trigger, open, items };
  }

  it('idle: the trigger is named More and is not pressed', () => {
    const { trigger } = setup();
    expect(trigger().getAttribute('aria-label')).toBe(t.moreButton);
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
  });

  it('opens to the six items in order, tools with their descriptions', async () => {
    const { open, items, trigger } = setup();
    await open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const list = items();
    expect(list.map((el) => el.textContent)).toEqual([
      `${t.highlightLabel}${t.highlightDescription}`,
      `${t.commentToolLabel}${t.commentDescription}`,
      t.ellipseLabel,
      t.rectangleLabel,
      t.lineLabel,
      `${t.feedbackButton}${t.feedbackDescription}`,
    ]);
    expect(document.body.querySelector('[role="separator"]')).not.toBeNull();
    expect(document.body.textContent).toContain(t.shapesButton);
  });

  it('picking Comment calls onPick and closes the menu', async () => {
    const { open, items, onPick, trigger } = setup();
    await open();
    await act(async () => { items()[1].click(); });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0] as MoreTool).toBe('comment');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(items()).toHaveLength(0);
  });

  it('an armed More tool becomes the trigger and all six words hold its width', () => {
    const { trigger } = setup({ selectedTool: 'ellipse' });
    expect(trigger().getAttribute('aria-label')).toBe(t.ellipseLabel);
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    const words = Array.from(trigger().querySelectorAll<HTMLElement>('[data-more-word]'));
    expect(words.map((w) => w.textContent)).toEqual([
      t.moreButton, t.highlightLabel, t.commentToolLabel, t.ellipseLabel, t.rectangleLabel, t.lineLabel,
    ]);
    const visible = words.filter((w) => w.getAttribute('aria-hidden') !== 'true');
    expect(visible.map((w) => w.textContent)).toEqual([t.ellipseLabel]);
    expect(words.filter((w) => w.hasAttribute('data-inactive'))).toHaveLength(5);
  });

  it('a double-click on the trigger locks the armed tool', () => {
    const { trigger, onLock } = setup({ selectedTool: 'highlight' });
    act(() => { trigger().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(onLock).toHaveBeenCalledWith('highlight');
  });

  it('a double-click after a pick locks it, though the one-shot placement disarmed the tool', async () => {
    const { open, items, trigger, onPick, onLock } = setup();
    await open();
    const ellipse = items().find((el) => el.textContent?.includes(t.ellipseLabel))!;
    await act(async () => { ellipse.click(); });
    expect(onPick.mock.calls[0][0]).toBe('ellipse');
    act(() => {
      render(
        <MoreToolsMenu t={t} selectedTool={null} toolLocked={false} onPick={onPick} onLock={onLock} feedbackHref={HREF} />,
        container,
      );
    });
    act(() => { trigger().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(onLock).toHaveBeenCalledWith('ellipse');
  });

  it('a double-click with nothing armed or picked locks nothing', () => {
    const { trigger, onLock } = setup();
    act(() => { trigger().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(onLock).not.toHaveBeenCalled();
  });

  it('Feedback is a new-tab link to the prefilled issue', async () => {
    const { open, items } = setup();
    await open();
    const link = items()[5] as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(HREF);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('title')).toBe(t.feedbackTitle);
  });

  it('the Hebrew catalogue gives the menu dir rtl', async () => {
    const { open } = setup({ t: hebrewSignMessages });
    await open();
    expect(document.body.querySelector('[role="menu"]')!.getAttribute('dir')).toBe('rtl');
  });
});
