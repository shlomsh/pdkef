import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageCellActions, PageCellButton } from './PageCellActions.tsx';

describe('PageCellButton', () => {
  let container: HTMLElement;
  afterEach(() => {
    render(null, container);
    container.remove();
  });
  function mount(node: preact.ComponentChildren) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(node, container));
  }

  it('names the button, shows the tip word aside, and hides the glyph from assistive tech', () => {
    mount(
      <PageCellActions>
        <PageCellButton label="Rotate page 3" tip="Rotate" onClick={() => {}}>
          <svg data-testid="icon" />
        </PageCellButton>
      </PageCellActions>,
    );
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate page 3"]')!;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    const tip = container.querySelector('[data-tip]')!;
    expect(tip.textContent).toBe('Rotate');
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    const glyph = button.querySelector('[data-testid="icon"]')!.parentElement!;
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
  });

  it('reports pressed state and calls onClick', () => {
    const onClick = vi.fn();
    mount(<PageCellButton label="Skip page 1" tip="Skip" pressed onClick={onClick}>x</PageCellButton>);
    const button = container.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    act(() => button.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
