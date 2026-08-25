// The reported bug lived exactly here: ElementToolbar used to pass
// element.fontFamily (the raw pick) straight through to FontPickerMenu,
// so the picker highlighted a font that wasn't actually rendering. These
// tests exercise the real wiring — ElementToolbar mounted with a text
// element — rather than re-testing FontPickerMenu's own logic in isolation.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import ElementToolbar from './ElementToolbar.tsx';

describe('ElementToolbar font picker wiring', () => {
  let container: HTMLDivElement | null;

  afterEach(() => {
    if (container) {
      act(() => render(null, container as any));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  function mountAndOpenFontMenu(element: any) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <ElementToolbar element={element} onChange={() => {}} onClone={() => {}} onDelete={() => {}} />,
        container as any
      );
    });
    const trigger = (container as HTMLDivElement).querySelector('button[title^="Font:"]') as HTMLButtonElement;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return { trigger, menu: document.body.querySelector('[role="menu"]') as HTMLElement };
  }

  it('highlights the effective font (Gveret Levin) when Caveat is picked but the text is Hebrew', () => {
    const element = { id: 'e1', type: 'text', fontFamily: 'Caveat', text: 'שלום עולם' };
    const { trigger, menu } = mountAndOpenFontMenu(element);

    expect(trigger.title).toBe('Font: Gveret Levin');

    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const caveatItem = items.find((el) => el.textContent?.startsWith('Caveat'))!;
    const gveretItem = items.find((el) => el.textContent?.startsWith('Gveret Levin'))!;

    expect(caveatItem.className).not.toMatch(/active/);
    expect(caveatItem.textContent).toContain('no Hebrew');
    expect(gveretItem.className).toMatch(/active/);
  });

  it('highlights the picked font when the text has no script conflict', () => {
    const element = { id: 'e2', type: 'text', fontFamily: 'Caveat', text: 'Hello world' };
    const { trigger, menu } = mountAndOpenFontMenu(element);

    expect(trigger.title).toBe('Font: Caveat');

    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const caveatItem = items.find((el) => el.textContent?.startsWith('Caveat'))!;
    expect(caveatItem.className).toMatch(/active/);
    expect(caveatItem.textContent).not.toContain('no ');
  });
});
