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
    // Contract change (W3): the note names the missing characters, not a
    // script name, but Caveat must still be marked unable to draw this text.
    expect(caveatItem.textContent).toContain('Missing');
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

describe('ElementToolbar text direction indicator', () => {
  let container: HTMLDivElement | null;

  afterEach(() => {
    if (container) {
      act(() => render(null, container as any));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  function mountDirectionButton(text: string) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <ElementToolbar element={{ id: 'direction', type: 'text', text, fontFamily: 'Arimo' }} onChange={() => {}} onClone={() => {}} onDelete={() => {}} />,
        container as any
      );
    });
    return container.querySelector('button[title^="Right-to-left text"], button[title^="Left-to-right text"]') as HTMLButtonElement;
  }

  it('shows the RTL icon without presenting it as a selected formatting state', () => {
    const button = mountDirectionButton('שלום');

    expect(button.title).toBe('Right-to-left text (Hebrew/Arabic)');
    expect(button.getAttribute('aria-label')).toBe('Text direction: right to left');
    expect(button.className).not.toMatch(/active/);
    expect(button.querySelector('svg')?.getAttribute('class')).toContain('pilcrow-left');
  });

  it('shows the LTR icon without presenting it as a selected formatting state', () => {
    const button = mountDirectionButton('Hello');

    expect(button.title).toBe('Left-to-right text');
    expect(button.getAttribute('aria-label')).toBe('Text direction: left to right');
    expect(button.className).not.toMatch(/active/);
    expect(button.querySelector('svg')?.getAttribute('class')).toContain('pilcrow-right');
  });
});

// W5 (docs/wysiwyg-text-architecture.md §3.4): Bold/Italic must be disabled,
// not synthesised-looking, on a family with no real face for that style -
// this used to render bold on screen and upright in the download.
describe('ElementToolbar Bold/Italic honesty (W5)', () => {
  let container: HTMLDivElement | null;

  afterEach(() => {
    if (container) {
      act(() => render(null, container as any));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  function mount(element: any, onChange = (_changes: any) => {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <ElementToolbar element={element} onChange={onChange} onClone={() => {}} onDelete={() => {}} />,
        container as any
      );
    });
    return {
      bold: container.querySelector('button[title*="old"]') as HTMLButtonElement,
      italic: container.querySelector('button[title*="talic"]') as HTMLButtonElement,
    };
  }

  it('disables Bold and Italic on Great Vibes, a Regular-only face, and explains why', () => {
    const element = { id: 'e1', type: 'text', fontFamily: 'Great Vibes', text: 'Signed' };
    const { bold, italic } = mount(element);

    expect(bold.disabled).toBe(true);
    expect(italic.disabled).toBe(true);
    expect(bold.title).toBe('Great Vibes has no bold version');
    expect(italic.title).toBe('Great Vibes has no italic version');

    // Reachable by a screen reader via aria-describedby, not colour or title
    // alone.
    const boldReasonId = bold.getAttribute('aria-describedby')!;
    expect(boldReasonId).toBeTruthy();
    expect(document.getElementById(boldReasonId)?.textContent).toBe('Great Vibes has no bold version');
  });

  it('enables Bold but disables Italic on Caveat, which W4 gave a Bold but no Italic', () => {
    const element = { id: 'e2', type: 'text', fontFamily: 'Caveat', text: 'Hello' };
    const { bold, italic } = mount(element);

    expect(bold.disabled).toBe(false);
    expect(bold.title).toBe('Bold');
    expect(italic.disabled).toBe(true);
    expect(italic.title).toBe('Caveat has no italic version');
  });

  it('leaves Bold/Italic enabled on a family that ships every style (Arimo)', () => {
    const element = { id: 'e3', type: 'text', fontFamily: 'Arimo', text: 'Hello' };
    const { bold, italic } = mount(element);

    expect(bold.disabled).toBe(false);
    expect(italic.disabled).toBe(false);
    expect(bold.hasAttribute('aria-describedby')).toBe(false);
    expect(italic.hasAttribute('aria-describedby')).toBe(false);
  });

  // Edge case: a draft saved before W5 (drafts persist 14 days), or a family
  // switch that left fontWeight 'bold' behind, can leave an element "bold"
  // on a family with no real bold face. The stored value is left alone (no
  // silent rewrite of what the user saved) but the disabled control must
  // never also read as pressed - that combination is the one state this
  // control must never show.
  it('never shows Bold as pressed while it is disabled, even if the element was already marked bold', () => {
    const element = { id: 'e4', type: 'text', fontFamily: 'Great Vibes', text: 'Signed', fontWeight: 'bold' };
    const { bold } = mount(element);

    expect(bold.disabled).toBe(true);
    expect(bold.className).not.toMatch(/active/);
  });

  it('clicking Bold toggles fontWeight when a real bold face exists', () => {
    const element = { id: 'e5', type: 'text', fontFamily: 'Arimo', text: 'Hello' };
    let changes: any = null;
    const { bold } = mount(element, (c) => { changes = c; });

    act(() => {
      bold.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(changes).toEqual({ fontWeight: 'bold' });
  });
});
