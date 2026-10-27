import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolShellContext } from '../ToolShell.tsx';
import { englishShellMessages } from '../shellMessages';
import ReplaceFileLine from './ReplaceFileLine.tsx';

describe('ReplaceFileLine', () => {
  let container: HTMLElement;
  const mount = (messages = englishShellMessages) => {
    const requestReplace = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(
      <ToolShellContext.Provider value={{ requestReplace, requestClear: vi.fn(), messages }}>
        <ReplaceFileLine />
      </ToolShellContext.Provider>,
      container,
    ));
    return requestReplace;
  };
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('is one quiet line with the replace glyph and the shell label, going through the shell confirmation', () => {
    const requestReplace = mount();
    const line = container.querySelector('[data-replace-line]');
    const button = line.querySelector('button');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(button.textContent).toBe('Replace file');
    expect(button.getAttribute('title')).toBe('Replace the current file');
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    act(() => button.click());
    expect(requestReplace).toHaveBeenCalledTimes(1);
  });

  it('speaks the page language', () => {
    mount({ ...englishShellMessages, replaceLabel: 'החלפת קובץ', replaceTitle: 'החלפת הקובץ הנוכחי' });
    expect(container.querySelector('[data-replace-line] button').textContent).toBe('החלפת קובץ');
  });
});
