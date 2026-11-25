import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { ComponentProps } from 'preact';
import { describe, expect, it, afterEach } from 'vitest';
import DropzoneEmptyState from './DropzoneEmptyState.tsx';
// Asserts the sheet-end, file-input, pick-row and privacy-line classes: the layout hooks CSS waits on and keeps off display:none.
import { hebrewShellMessages } from './shellMessages';

type Props = Partial<ComponentProps<typeof DropzoneEmptyState>>;

const IOS_HINT_TEXT = 'On iPhone or iPad, share the PDF to Files';

describe('DropzoneEmptyState', () => {
  let mounted: HTMLDivElement | null = null;
  // Every test mounts first, so the container is always set where it is read.
  const host = () => mounted as HTMLDivElement;

  afterEach(() => {
    if (mounted) {
      act(() => render(null, mounted as HTMLDivElement));
      mounted.remove();
      mounted = null;
    }
  });

  function mount(props: Props = {}) {
    const container = document.createElement('div');
    mounted = container;
    document.body.appendChild(container);
    // Deliberately not wrapped in act(): act flushes effects, and the
    // hydration-match guarantee is specifically about the render that
    // happens before they run - see FileDropzone.tsx's `recents` comment,
    // which this component follows for the same reason (no `navigator` on
    // the server, so the first client render must agree with it).
    render(<DropzoneEmptyState onFiles={() => {}} showIosFilesHint {...props} />, container);
  }

  async function flushMountEffect(props: Props = {}) {
    await act(async () => {
      render(<DropzoneEmptyState onFiles={() => {}} showIosFilesHint {...props} />, host());
    });
  }

  // The iPhone and Android user agents are in DropzoneEmptyState.iphone.test.tsx and .android.test.tsx.
  it('never shows the notice on a stubbed desktop navigator', async () => {
    // Live control: jsdom's own user agent is a desktop one, neither iOS nor Android.
    expect(navigator.userAgent).not.toMatch(/iPhone|iPad|iPod|Android/);
    mount();
    await flushMountEffect();
    expect(host().textContent).not.toContain(IOS_HINT_TEXT);
  });

  // The sheet's art slot: the tool's verb replaces the file-plus icon.
  it('renders the art in place of the file-plus icon when given', () => {
    mount({ art: <div data-testid="verb-art" /> });
    expect(host().querySelector('[data-testid="verb-art"]')).not.toBeNull();
    expect(host().querySelector('[data-testid="dropzone-icon"]')).toBeNull();
  });

  it('ends with a hidden marker, so CSS can wait for the whole sheet before painting it', () => {
    mount();
    const sheet = host().querySelector('[data-empty-state]');
    const end = sheet.querySelector('[data-sheet-end]');
    const others = [...sheet.querySelectorAll('*')].filter((el) => el !== end);
    expect(others.every((el) => end.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)).toBe(true);
    expect(end.hasAttribute('hidden')).toBe(true);
  });

  it('keeps the file-plus icon when no art is given', () => {
    mount();
    expect(host().querySelector('[data-testid="dropzone-icon"]')).not.toBeNull();
  });

  it('takes its heading and body from props, with Choose files after them', () => {
    mount({ heading: 'Drop PDFs here, or paste', body: 'Files never leave your device.' });
    expect(host().querySelector('strong').textContent).toContain('Drop PDFs here, or paste');
    expect(host().querySelector('[data-privacy-line]').textContent).toContain('Files never leave your device.');
    expect(host().textContent).toContain('Choose files');
  });

  // Phones have no drag and no paste: both variants are in the markup and CSS
  // shows one per width, so nothing is read twice and no JS decides.
  it('holds a phone and a desktop span for a heading and body that differ from the defaults', () => {
    mount({ message: 'Drop here', heading: 'Drop here, or paste', body: 'Desktop line.' });
    const strong = host().querySelector('strong');
    const [phone, desktop] = strong.querySelectorAll('[data-width]');
    expect(phone.textContent).toBe('Drop here');
    expect(desktop.textContent).toBe('Drop here, or paste');
    const line = host().querySelector('[data-privacy-line]');
    expect(line.querySelectorAll('[data-width]')[0].textContent).toBe('Private. Files never leave your device.');
    expect(line.querySelectorAll('[data-width]')[1].textContent).toBe('Desktop line.');
  });

  it('puts an action in one row with the pick button, as an equal choice, and nothing extra without one', () => {
    mount({ action: <button type="button" data-testid="extra">Take a photo</button> });
    const picker = host().querySelector('label');
    expect(picker?.parentElement?.hasAttribute('data-pick-row')).toBe(true);
    expect(picker?.nextElementSibling?.getAttribute('data-testid')).toBe('extra');
    act(() => render(null, host()));
    host().remove();
    mount();
    expect(host().querySelector('[data-testid="extra"]')).toBeNull();
    expect(host().querySelector('label')?.nextElementSibling?.hasAttribute('data-privacy-line')).toBe(true);
  });

  it('renders one plain strong and line when no heading or body is given', () => {
    mount({ message: 'Drop here' });
    expect(host().querySelector('strong').children.length).toBe(0);
    expect(host().querySelector('strong').textContent).toBe('Drop here');
    expect(host().querySelectorAll('strong span, [data-privacy-line] > [data-width]')).toHaveLength(0);
  });

  // QUAL-22: `hidden` is display:none, which removes the input from the tab
  // order. The real keyboard behaviour is proved in a browser by
  // e2e/tool-empty-state-keyboard.spec.js; this only keeps the attribute out.
  it('keeps the file input out of display:none so Tab can reach it', () => {
    mount();
    const input = host().querySelector('input[type="file"]');
    expect(input.hasAttribute('hidden')).toBe(false);
    expect(input.hasAttribute('data-file-input')).toBe(true);
  });

  describe('drag-over caption', () => {
    const caption = () => host().querySelector('[data-drag-caption]');

    it('renders the many caption in English, without adding a span to the heading', () => {
      mount({ showIosFilesHint: false });
      expect(caption().textContent).toBe('Let go to add your files');
      expect(host().querySelectorAll('strong span')).toHaveLength(0);
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

  describe('actionLeads and pickLabel', () => {
    const action = <button type="button" data-testid="lead-action">Start</button>;
    const order = () => Array.from(host().querySelector('[data-pick-row]').children).map((el) => el.tagName);

    it('pickLabel replaces the picker words', () => {
      mount({ pickLabel: 'Choose photos' });
      expect(host().querySelector('label').textContent).toBe('Choose photos');
    });

    it('with actionLeads the action comes first and the row is marked', () => {
      mount({ action, actionLeads: true });
      const row = host().querySelector('[data-pick-row]');
      expect(row.hasAttribute('data-action-leads')).toBe(true);
      expect(order()).toEqual(['BUTTON', 'LABEL']);
    });

    it('without actionLeads the picker comes first and there is no attribute', () => {
      mount({ action });
      const row = host().querySelector('[data-pick-row]');
      expect(row.hasAttribute('data-action-leads')).toBe(false);
      expect(order()).toEqual(['LABEL', 'BUTTON']);
    });
  });

  describe('art', () => {
    it("sits in the sheet's band, first, so a phone can give it the spare height", () => {
      mount({ showIosFilesHint: false, art: <i data-art /> });
      const band = host().querySelector('[data-verb-band]');
      expect(band?.firstElementChild?.hasAttribute('data-art')).toBe(true);
      expect(host().querySelector('[data-empty-state]')?.firstElementChild).toBe(band);
    });

    it('leaves the default icon out of the band', () => {
      mount({ showIosFilesHint: false });
      expect(host().querySelector('[data-verb-band]')).toBeNull();
    });
  });
});
