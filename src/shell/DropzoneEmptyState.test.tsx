// @ts-nocheck - mirrors FileDropzone.test.tsx's own untyped-test convention.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import DropzoneEmptyState from './DropzoneEmptyState.tsx';
import styles from './Dropzone.module.css';
import { hebrewShellMessages } from '../i18n/toolMessages';

const IPHONE_NAVIGATOR = {
  platform: 'iPhone',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5,
};

const ANDROID_NAVIGATOR = {
  platform: 'Linux armv8l',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  maxTouchPoints: 5,
};

const DESKTOP_NAVIGATOR = {
  platform: 'MacIntel',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  maxTouchPoints: 0,
};

const IOS_HINT_TEXT = 'On iPhone or iPad, share the PDF to Files';

describe('DropzoneEmptyState', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.unstubAllGlobals();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    // Deliberately not wrapped in act(): act flushes effects, and the
    // hydration-match guarantee is specifically about the render that
    // happens before they run - see FileDropzone.tsx's `recents` comment,
    // which this component follows for the same reason (no `navigator` on
    // the server, so the first client render must agree with it).
    render(<DropzoneEmptyState onFiles={() => {}} showIosFilesHint {...props} />, container);
  }

  async function flushMountEffect(props = {}) {
    await act(async () => {
      render(<DropzoneEmptyState onFiles={() => {}} showIosFilesHint {...props} />, container);
    });
  }

  it('shows no iOS notice on the first render, regardless of platform', () => {
    vi.stubGlobal('navigator', IPHONE_NAVIGATOR);
    mount();
    expect(container.textContent).not.toContain(IOS_HINT_TEXT);
  });

  it('shows the notice after mount on a stubbed iOS navigator', async () => {
    vi.stubGlobal('navigator', IPHONE_NAVIGATOR);
    mount();
    await flushMountEffect();
    expect(container.textContent).toContain(IOS_HINT_TEXT);
  });

  it('never shows the notice on a stubbed Android navigator', async () => {
    vi.stubGlobal('navigator', ANDROID_NAVIGATOR);
    mount();
    await flushMountEffect();
    expect(container.textContent).not.toContain(IOS_HINT_TEXT);
  });

  it('never shows the notice on a stubbed desktop navigator', async () => {
    vi.stubGlobal('navigator', DESKTOP_NAVIGATOR);
    mount();
    await flushMountEffect();
    expect(container.textContent).not.toContain(IOS_HINT_TEXT);
  });

  it('never shows the notice when the tool has not opted in, even on iOS', async () => {
    vi.stubGlobal('navigator', IPHONE_NAVIGATOR);
    mount({ showIosFilesHint: false });
    await flushMountEffect({ showIosFilesHint: false });
    expect(container.textContent).not.toContain(IOS_HINT_TEXT);
  });

  // The sheet's art slot: the tool's verb replaces the file-plus icon.
  it('renders the art in place of the file-plus icon when given', () => {
    mount({ art: <div data-testid="verb-art" /> });
    expect(container.querySelector('[data-testid="verb-art"]')).not.toBeNull();
    expect(container.querySelector(`.${styles['dropzone-icon']}`)).toBeNull();
  });

  it('ends with a hidden marker, so CSS can wait for the whole sheet before painting it', () => {
    mount();
    const end = container.querySelector('[data-empty-state]').lastElementChild;
    expect(end.className).toBe(styles['sheet-end']);
    expect(end.hasAttribute('hidden')).toBe(true);
  });

  it('keeps the file-plus icon when no art is given', () => {
    mount();
    expect(container.querySelector(`.${styles['dropzone-icon']}`)).not.toBeNull();
  });

  it('takes its heading and body from props, with Choose files after them', () => {
    mount({ heading: 'Drop PDFs here, or paste', body: 'Files never leave your device.' });
    expect(container.querySelector('strong').textContent).toContain('Drop PDFs here, or paste');
    expect(container.querySelector(`.${styles['privacy-line']}`).textContent).toContain('Files never leave your device.');
    expect(container.textContent).toContain('Choose files');
  });

  // Phones have no drag and no paste: both variants are in the markup and CSS
  // shows one per width, so nothing is read twice and no JS decides.
  it('holds a phone and a desktop span for a heading and body that differ from the defaults', () => {
    mount({ message: 'Drop here', heading: 'Drop here, or paste', body: 'Desktop line.' });
    const strong = container.querySelector('strong');
    const phone = strong.querySelector(`.${styles['empty-phone']}`);
    const desktop = strong.querySelector(`.${styles['empty-desktop']}`);
    expect(phone.textContent).toBe('Drop here');
    expect(desktop.textContent).toBe('Drop here, or paste');
    const line = container.querySelector(`.${styles['privacy-line']}`);
    expect(line.querySelector(`.${styles['empty-phone']}`).textContent).toBe('Private. Files never leave your device.');
    expect(line.querySelector(`.${styles['empty-desktop']}`).textContent).toBe('Desktop line.');
  });

  it('renders an action directly under the pick button, and nothing extra without one', () => {
    mount({ action: <button type="button" data-testid="extra">Take a photo</button> });
    const picker = container.querySelector(`.${styles['file-picker-button']}`);
    expect(picker.nextElementSibling.getAttribute('data-testid')).toBe('extra');
    act(() => render(null, container));
    container.remove();
    mount();
    expect(container.querySelector('[data-testid="extra"]')).toBeNull();
    expect(container.querySelector(`.${styles['file-picker-button']}`).nextElementSibling.className).toBe(styles['privacy-line']);
  });

  it('renders one plain strong and line when no heading or body is given', () => {
    mount({ message: 'Drop here' });
    expect(container.querySelector('strong').children.length).toBe(0);
    expect(container.querySelector('strong').textContent).toBe('Drop here');
    expect(container.querySelector(`.${styles['empty-phone']}`)).toBeNull();
    expect(container.querySelector(`.${styles['empty-desktop']}`)).toBeNull();
  });

  // QUAL-22: `hidden` is display:none, which removes the input from the tab
  // order. The real keyboard behaviour is proved in a browser by
  // e2e/tool-empty-state-keyboard.spec.js; this only keeps the attribute out.
  it('keeps the file input out of display:none so Tab can reach it', () => {
    mount();
    const input = container.querySelector('input[type="file"]');
    expect(input.hasAttribute('hidden')).toBe(false);
    expect(input.className).toContain(styles['file-input']);
  });

  describe('drag-over caption', () => {
    const caption = () => container.querySelector(`.${styles['dropzone-text']} strong.${styles['drag-caption']}`);

    it('renders the many caption in English, without adding a span to the heading', () => {
      mount({ showIosFilesHint: false });
      expect(caption().textContent).toBe('Let go to add your files');
      expect(container.querySelectorAll('strong span')).toHaveLength(0);
    });

    it('renders the one caption for single-file tools', () => {
      mount({ showIosFilesHint: false, multiple: false });
      expect(caption().textContent).toBe('Let go to add your file');
    });

    it('uses the Hebrew messages', () => {
      mount({ showIosFilesHint: false, messages: hebrewShellMessages });
      expect(caption().textContent).toBe('גררו לכאן כדי להוסיף קבצים');
      mount({ showIosFilesHint: false, messages: hebrewShellMessages, multiple: false });
      expect(caption().textContent).toBe('גררו לכאן כדי להוסיף קובץ');
    });
  });
});
