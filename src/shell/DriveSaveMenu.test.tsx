import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveSaveMenu from './DriveSaveMenu.tsx';
import { englishShellMessages } from './shellMessages.ts';

const t = englishShellMessages.saveToDrive;
type Drive = Parameters<typeof DriveSaveMenu>[0]['drive'];

describe('DriveSaveMenu', () => {
  let container: HTMLElement;
  const save = vi.fn();
  const mount = (drive: Partial<Drive>) => act(() => render(<DriveSaveMenu drive={{ state: 'idle', link: null, available: true, save, ...drive }} />, container));
  const arrow = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  const menu = () => document.body.querySelector('[role="menu"]');
  beforeEach(() => { container = document.createElement('div'); document.body.append(container); save.mockReset(); });
  afterEach(() => { render(null, container); container.remove(); });

  it('renders nothing when unavailable and idle', () => {
    mount({ available: false });
    expect(container.innerHTML).toBe('');
  });

  it('is a closed arrow that opens a menu with the Save item, calling save directly from the tap', () => {
    mount({});
    expect(arrow()?.getAttribute('aria-label')).toBe(t.more);
    expect(arrow()?.getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();
    act(() => arrow()?.click());
    expect(arrow()?.getAttribute('aria-expanded')).toBe('true');
    const item = document.body.querySelector<HTMLButtonElement>('[role="menuitem"]');
    expect(item?.textContent).toContain(t.save);
    const img = item?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/images/brand/google-drive.png');
    expect(img?.getAttribute('alt')).toBe('');
    act(() => item?.click());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('opens itself when saving starts and shows the status without a button', () => {
    mount({});
    mount({ state: 'saving' });
    expect(menu()).not.toBeNull();
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe(t.saving);
    expect(document.body.querySelector('[role="menuitem"]')).toBeNull();
  });

  it('shows Saved with an Open link only when there is one', () => {
    mount({ state: 'saved', link: 'https://drive.google.com/file/d/1/view' });
    const a = document.body.querySelector<HTMLAnchorElement>('a');
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe(t.saved);
    const link = document.body.querySelector<HTMLAnchorElement>('[data-drive-saved] a');
    expect(link?.textContent).toBe(t.openShort);
    expect(link?.getAttribute('aria-label')).toBe(t.open);
    expect(link?.closest('[data-drive-saved]')?.querySelector('[role="status"]')?.textContent).toBe(t.saved);
    expect(a?.getAttribute('href')).toBe('https://drive.google.com/file/d/1/view');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener');
    mount({ state: 'saved', link: null });
    expect(document.body.querySelector('a')).toBeNull();
  });

  it('shows the failure with a retry item, and stays open until Escape', () => {
    mount({ state: 'failed' });
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe(t.failed);
    act(() => document.body.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click());
    expect(save).toHaveBeenCalledTimes(1);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(menu()).toBeNull();
  });
});
