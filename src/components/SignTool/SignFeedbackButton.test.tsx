// @ts-nocheck - follows the Preact DOM-test setup used by the Sign toolbar.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SignFeedbackButton from './SignFeedbackButton.tsx';

describe('SignFeedbackButton', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  it('opens a general Sign-tool bug or feedback template in a new tab', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => render(<SignFeedbackButton className="toolbar-button" labelClassName="toolbar-label" />, container));

    const link = container.querySelector('.toolbar-button');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('aria-label')).toBe(link.getAttribute('title'));
    expect(link.getAttribute('title')).toBe('Report a bug or share feedback about Sign & Fill PDF (opens GitHub)');
    expect(link.textContent).toBe('Feedback');

    const url = new URL(link.href);
    expect(url.origin + url.pathname).toBe('https://github.com/shlomsh/pdkef/issues/new');
    expect(url.searchParams.get('title')).toBe('[Sign & Fill PDF] Bug report or feedback');
    const body = url.searchParams.get('body');
    expect(body).toContain('bug, idea, or feedback');
    expect(body).toContain('If something went wrong (optional)');
    expect(body).toContain('How can we reproduce it?');
    expect(body).toContain('language or font if relevant');
    expect(body).toContain('GitHub issues are public.');
    expect(body).not.toContain('%0A');
  });
});
