// Guards the picker/notice contradiction bug: the font picker must reflect
// the EFFECTIVE font (resolveFontFamily's output), not the raw pick, and
// must mark any option that would be substituted away for the current text —
// using the exact same rule (resolveFontSubstitution) the on-page notice and
// the exporter use, so the three can never disagree.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import FontPickerMenu from './FontPickerMenu.tsx';
import { resolveFontFamily } from '../lib/fonts.js';

describe('FontPickerMenu', () => {
  let container: HTMLDivElement | null;

  afterEach(() => {
    if (container) {
      act(() => render(null, container as any));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  function openMenu(value: string, text: string) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <FontPickerMenu value={value} text={text} onChange={() => {}} />,
        container as any
      );
    });
    act(() => {
      (container as HTMLDivElement).querySelector('button')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });
    return document.body.querySelector('[role="menu"]') as HTMLElement;
  }

  it('checks the effective font (Gveret Levin), not the requested one (Caveat), for Hebrew text', () => {
    const hebrewText = 'שלום עולם';
    const effective = resolveFontFamily('Caveat', hebrewText);
    expect(effective).toBe('Gveret Levin');

    const menu = openMenu(effective, hebrewText);
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));

    const caveatItem = items.find((el) => el.textContent?.startsWith('Caveat'))!;
    const gveretItem = items.find((el) => el.textContent?.startsWith('Gveret Levin'))!;

    expect(caveatItem.className).not.toMatch(/active/);
    expect(gveretItem.className).toMatch(/active/);
  });

  it('marks Caveat as unable to draw the Hebrew text and leaves Gveret Levin unmarked', () => {
    const hebrewText = 'שלום עולם';
    const effective = resolveFontFamily('Caveat', hebrewText);
    const menu = openMenu(effective, hebrewText);
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));

    const caveatItem = items.find((el) => el.textContent?.startsWith('Caveat'))!;
    const gveretItem = items.find((el) => el.textContent?.startsWith('Gveret Levin'))!;

    // Contract change (W3): the note now names the actual missing characters
    // instead of a script name, but it must still single out Caveat as unable
    // to draw this text and leave the effective font unmarked.
    expect(caveatItem.textContent).toContain("can't draw");
    for (const ch of new Set(hebrewText.replace(/\s/g, ''))) {
      expect(caveatItem.textContent).toContain(ch);
    }
    expect(caveatItem.className).toMatch(/unsupported/);

    expect(gveretItem.textContent).not.toContain("can't draw");
    expect(gveretItem.className).not.toMatch(/unsupported/);
  });

  it('marks nothing and checks the requested font for plain Latin text', () => {
    const latinText = 'Hello world';
    const effective = resolveFontFamily('Caveat', latinText);
    expect(effective).toBe('Caveat'); // no substitution needed

    const menu = openMenu(effective, latinText);
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));

    const caveatItem = items.find((el) => el.textContent?.startsWith('Caveat'))!;
    expect(caveatItem.className).toMatch(/active/);
    expect(caveatItem.className).not.toMatch(/unsupported/);

    for (const item of items) {
      expect(item.textContent).not.toContain('no ');
      expect(item.className).not.toMatch(/unsupported/);
    }
  });

  it('is script-general: Devanagari text checks Kalam and marks every other option', () => {
    const devanagariText = 'नमस्ते';
    const effective = resolveFontFamily('Caveat', devanagariText);
    expect(effective).toBe('Kalam');

    const menu = openMenu(effective, devanagariText);
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));

    const kalamItem = items.find((el) => el.textContent?.startsWith('Kalam'))!;
    const caveatItem = items.find((el) => el.textContent?.startsWith('Caveat'))!;
    const arimoItem = items.find((el) => el.textContent?.startsWith('Arimo'))!;

    expect(kalamItem.className).toMatch(/active/);
    expect(kalamItem.textContent).not.toContain("can't draw");

    // Contract change (W3): the note names the missing characters, not a
    // script name — but every non-Devanagari option must still be marked
    // unsupported for this text, proving the check is script-general rather
    // than a Hebrew-only special case.
    expect(caveatItem.className).toMatch(/unsupported/);
    expect(caveatItem.textContent).toContain("can't draw");

    expect(arimoItem.className).toMatch(/unsupported/);
    expect(arimoItem.textContent).toContain("can't draw");
  });

  it('shows the effective font in the trigger title, not the requested one', () => {
    const hebrewText = 'שלום עולם';
    const effective = resolveFontFamily('Caveat', hebrewText);
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <FontPickerMenu value={effective} text={hebrewText} onChange={() => {}} />,
        container as any
      );
    });
    const trigger = container.querySelector('button')!;
    expect(trigger.title).toContain('Gveret Levin');
    expect(trigger.title).not.toContain('Caveat');
  });

  it('keeps unsupported rows clickable (not aria-disabled/disabled)', () => {
    const hebrewText = 'שלום עולם';
    const effective = resolveFontFamily('Caveat', hebrewText);
    const menu = openMenu(effective, hebrewText);
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const caveatItem = items.find((el) => el.textContent?.startsWith('Caveat'))! as HTMLButtonElement;

    expect(caveatItem.disabled).toBe(false);
    expect(caveatItem.getAttribute('aria-disabled')).not.toBe('true');
  });
});
