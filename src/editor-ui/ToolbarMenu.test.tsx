import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import ToolbarMenu from './ToolbarMenu.tsx';

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

async function openMenu(props: Partial<Parameters<typeof ToolbarMenu>[0]> = {}) {
  const host = document.createElement('div');
  container = host;
  document.body.appendChild(host);
  const first = vi.fn();
  const second = vi.fn();
  act(() => {
    render(
      <ToolbarMenu
        title="On 3 pages"
        triggerClassName="trigger"
        triggerAttrs={{ 'data-test-trigger': true }}
        triggerContent="3"
        items={[
          { label: 'First', onSelect: first, attrs: { 'data-test-first': true } },
          { label: 'Second', onSelect: second },
        ]}
        {...props}
      />,
      host,
    );
  });
  const trigger = host.querySelector<HTMLButtonElement>('[data-test-trigger]')!;
  await act(async () => { trigger.click(); });
  return { trigger, first, second };
}

describe('ToolbarMenu', () => {
  it('opens a menu of its items from a titled trigger', async () => {
    const { trigger } = await openMenu();
    expect(trigger.title).toBe('On 3 pages');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent);
    expect(items).toEqual(['First', 'Second']);
  });

  it('fires the picked item once and closes', async () => {
    const { trigger, first, second } = await openMenu();
    await act(async () => { document.body.querySelector<HTMLButtonElement>('[data-test-first]')!.click(); });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a heading only when given one', async () => {
    await openMenu({ heading: 'On 3 pages' });
    expect(document.body.querySelector('[role="menu"]')!.textContent).toContain('On 3 pages');
  });
});
