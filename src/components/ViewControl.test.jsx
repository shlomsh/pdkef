import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import ViewControl from './ViewControl.jsx';
import styles from './ViewControl.module.css';

const STORAGE_KEY = 'pdf-toolkit:view-density';

describe('ViewControl', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-view-density');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.documentElement.removeAttribute('data-view-density');
  });

  const renderControl = (props = {}) => {
    const toggleFullscreen = vi.fn();
    act(() => {
      render(
        <ViewControl isFullscreen={false} toggleFullscreen={toggleFullscreen} {...props} />,
        container
      );
    });
    return { toggleFullscreen };
  };

  const getRadios = () => Array.from(container.querySelectorAll('[role="radio"]'));

  it('renders three radios in a radiogroup', () => {
    renderControl();
    const group = container.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(group.getAttribute('aria-label')).toBe('View density');
    expect(getRadios()).toHaveLength(3);
  });

  it('the segment matching the default density is checked, not fullscreen', () => {
    renderControl({ isFullscreen: false });
    const radios = getRadios();
    // Default density is 'condensed' (see useViewDensity.js) -> segment 1.
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios[2].getAttribute('aria-checked')).toBe('false');
  });

  it('segment 3 reflects isFullscreen regardless of stored density', () => {
    localStorage.setItem(STORAGE_KEY, 'relaxed');
    renderControl({ isFullscreen: true });
    const radios = getRadios();
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
    expect(radios[1].getAttribute('aria-checked')).toBe('false');
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
    expect(radios[2].getAttribute('aria-label')).toBe('Exit full screen');
  });

  it('clicking Relaxed sets density and persists it', async () => {
    renderControl();
    const radios = getRadios();
    await act(async () => {
      radios[0].click();
    });
    expect(container.querySelector('[role="radiogroup"]').children[0].getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('relaxed');
  });

  it('clicking Relaxed or Condensed while fullscreen exits fullscreen', async () => {
    const { toggleFullscreen } = renderControl({ isFullscreen: true });
    const radios = getRadios();
    await act(async () => {
      radios[0].click();
    });
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('clicking Full screen calls toggleFullscreen and leaves density untouched', async () => {
    const { toggleFullscreen } = renderControl();
    const radios = getRadios();
    await act(async () => {
      radios[2].click();
    });
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('only the active segment is tab-reachable (roving tabindex)', () => {
    renderControl();
    const radios = getRadios();
    expect(radios[0].getAttribute('tabindex')).toBe('-1');
    expect(radios[1].getAttribute('tabindex')).toBe('0');
    expect(radios[2].getAttribute('tabindex')).toBe('-1');
  });

  it('arrow keys move the roving tabindex and select a density segment', async () => {
    renderControl(); // density defaults to 'condensed' -> segment 1 starts active
    const group = container.querySelector('[role="radiogroup"]');

    await act(async () => {
      group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    });
    let radios = getRadios();
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('tabindex')).toBe('0');
    expect(radios[1].getAttribute('tabindex')).toBe('-1');

    await act(async () => {
      group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    radios = getRadios();
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
  });

  it('End moves to the Full screen segment and calls toggleFullscreen (isFullscreen is prop-driven, not local state)', async () => {
    const { toggleFullscreen } = renderControl();
    const group = container.querySelector('[role="radiogroup"]');

    await act(async () => {
      group.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    });
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('renders FullscreenButton unwrapped as the mobile fallback', () => {
    renderControl();
    // FullscreenButton uses SignToolbar.module.css's .button/.label, not this
    // module's classes, and must stay a direct sibling (not nested in a
    // wrapper) so it remains a direct .toolbar child - see ViewControl.jsx.
    const segmented = container.querySelector(`.${styles.segmented}`);
    const fallbackButton = container.querySelector('button:not([role="radio"])');
    expect(fallbackButton).not.toBeNull();
    expect(fallbackButton.previousElementSibling).toBe(segmented);
    expect(fallbackButton.parentElement).toBe(container);
  });
});
