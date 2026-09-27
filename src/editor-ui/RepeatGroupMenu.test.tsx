import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import RepeatGroupMenu from './RepeatGroupMenu.tsx';

let container: HTMLDivElement | null = null;

afterEach(() => {
  const host = container;
  if (host) {
    act(() => render(null, host));
    host.remove();
    container = null;
  }
  document.body.innerHTML = '';
});

const labels = {
  title: 'On 3 pages',
  heading: 'On 3 pages',
  fillLabel: 'Add to the remaining pages',
  unlinkLabel: 'Unlink this page',
  removeLabel: 'Remove from every page',
};

/** Renders the menu, opens it, and returns its trigger. */
async function openMenu(overrides: Partial<Parameters<typeof RepeatGroupMenu>[0]> = {}) {
  const host = document.createElement('div');
  container = host;
  document.body.appendChild(host);
  const props = {
    size: 3,
    ...labels,
    onUnlinkFromGroup: vi.fn(),
    onRemoveGroup: vi.fn(),
    ...overrides,
  };
  act(() => {
    render(<RepeatGroupMenu {...props} />, host);
  });
  const trigger = host.querySelector<HTMLButtonElement>('[data-editor-repeat-group-trigger]')!;
  await act(async () => { trigger.click(); });
  return { trigger, props };
}

describe('RepeatGroupMenu', () => {
  it('shows the trigger with the count', async () => {
    const { trigger } = await openMenu();
    expect(trigger.title).toBe('On 3 pages');
    expect(trigger.textContent).toContain('3');
    expect(host().querySelector('[data-editor-repeat-every-page]')).toBeNull();
  });

  it('shows the heading and the fill item when onRepeatOnEveryPage is given', async () => {
    const onRepeatOnEveryPage = vi.fn();
    const { trigger } = await openMenu({ onRepeatOnEveryPage });
    expect(document.body.textContent).toContain('On 3 pages');
    const fill = document.body.querySelector<HTMLButtonElement>('[data-editor-repeat-group-fill]')!;
    await act(async () => { fill.click(); });
    expect(onRepeatOnEveryPage).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('omits the fill item when onRepeatOnEveryPage is not given', async () => {
    await openMenu();
    expect(document.body.querySelector('[data-editor-repeat-group-fill]')).toBeNull();
  });

  it('unlink calls onUnlinkFromGroup once and closes', async () => {
    const { trigger, props } = await openMenu();
    const unlink = document.body.querySelector<HTMLButtonElement>('[data-editor-repeat-group-unlink]')!;
    await act(async () => { unlink.click(); });
    expect(props.onUnlinkFromGroup).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('remove calls onRemoveGroup once and closes', async () => {
    const { trigger, props } = await openMenu();
    const remove = document.body.querySelector<HTMLButtonElement>('[data-editor-repeat-group-remove]')!;
    await act(async () => { remove.click(); });
    expect(props.onRemoveGroup).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

function host() {
  return container!;
}
