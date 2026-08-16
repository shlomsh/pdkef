// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import FileDropzone from './FileDropzone.tsx';
import styles from './Dropzone.module.css';
import { loadDraft, deleteDraft, saveDraft, saveHandoff, readDraftMeta } from '../lib/draftStore.js';
import { setInputFiles } from '../test/setInputFiles.js';

vi.mock('../lib/draftStore.js', () => ({
  loadDraft: vi.fn(() => Promise.resolve(null)),
  deleteDraft: vi.fn(() => Promise.resolve(true)),
  saveDraft: vi.fn(() => Promise.resolve(true)),
  saveHandoff: vi.fn(() => Promise.resolve(true)),
  // Synchronous by contract (see draftStore.js) - the resume card reads it at
  // mount time, before any of the async mocks above would have settled.
  readDraftMeta: vi.fn(() => null),
}));

function dropOn(dropzone, files) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = { files };
  return act(async () => {
    dropzone.dispatchEvent(event);
    // The handoff path is async (loadDraft, then arrayBuffer) before it commits.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('FileDropzone', () => {
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
    loadDraft.mockResolvedValue(null);
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<FileDropzone {...props} />, container);
    });
  }

  it('renders correctly with default multiple=true', () => {
    mount({});
    expect(container.textContent).toContain('Drop PDFs here');
    expect(container.textContent).toContain('Choose files');
    const input = container.querySelector('input[type="file"]');
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('application/pdf');
  });

  it('renders correctly with multiple=false', () => {
    mount({ multiple: false });
    expect(container.textContent).toContain('Drop PDF here');
    expect(container.textContent).toContain('Choose file');
    const input = container.querySelector('input[type="file"]');
    expect(input.multiple).toBe(false);
  });

  // The homepage CTA (`index.astro`) mounts FileDropzone with an `href`, which
  // renders the picker as a navigating anchor instead of a file <input> label.
  it('renders the picker as an anchor (no file input) when href is set', () => {
    mount({ href: '/sign?action=open' });
    const link = container.querySelector(`a.${styles['file-picker-button']}`);
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/sign?action=open');
    expect(link.textContent).toContain('Choose files');
    // In href mode there is no hidden file input.
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  describe('resume-draft card', () => {
    it('renders nothing when no tool has a draft', () => {
      readDraftMeta.mockReturnValue(null);
      mount({ toolTarget: 'sign', href: '/sign?action=open' });
      expect(container.textContent).not.toContain('Pick up where you left off');
      expect(container.textContent).not.toContain('Continue');
    });

    it('shows a saved draft above the dropzone, and drops the "Drop PDFs" pitch', () => {
      readDraftMeta.mockImplementation((tool) =>
        tool === 'sign'
          ? { fileName: 'contract.pdf', savedAt: Date.now() - 60_000, preview: 'data:image/jpeg;base64,abc' }
          : null,
      );
      mount({ toolTarget: 'sign', href: '/sign?action=open' });

      expect(container.textContent).toContain('Pick up where you left off');
      expect(container.textContent).toContain('contract.pdf');
      expect(container.textContent).toContain('Sign & Fill PDF');
      expect(container.querySelector('img[src="data:image/jpeg;base64,abc"]')).not.toBeNull();

      const continueLink = container.querySelector('a[href="/sign/"]');
      expect(continueLink).not.toBeNull();
      expect(continueLink.textContent).toContain('Continue');

      // The card already made the case for resuming; the dropzone below
      // shouldn't repeat the from-scratch pitch as if the card said nothing.
      expect(container.textContent).not.toContain('Drop PDFs here');
      expect(container.textContent).toContain('Or start something new');
    });

    it('lists both tools, most recently saved first, and never renders a dismiss control', () => {
      const older = Date.now() - 2 * 60 * 60 * 1000;
      const newer = Date.now() - 60_000;
      readDraftMeta.mockImplementation((tool) => {
        if (tool === 'sign') return { fileName: 'older-sign.pdf', savedAt: older };
        if (tool === 'redact') return { fileName: 'newer-redact.pdf', savedAt: newer };
        return null;
      });
      mount({ toolTarget: 'sign', href: '/sign?action=open' });

      const names = Array.from(container.querySelectorAll('li')).map((li) =>
        li.textContent.includes('newer-redact.pdf') ? 'redact' : 'sign',
      );
      expect(names).toEqual(['redact', 'sign']);

      // No '×'/close control anywhere in the card: dismissing would hide a
      // draft whose bytes are still sitting in IndexedDB, implying it's gone
      // when it isn't. See ResumeDraftCard.tsx's header comment.
      expect(container.querySelector('button[aria-label="Hide"]')).toBeNull();
      expect(container.textContent).not.toMatch(/[×✕]/);
    });

    it('draws an empty preview box, not a broken image, when a draft has no preview', () => {
      readDraftMeta.mockImplementation((tool) =>
        tool === 'sign' ? { fileName: 'pdf1.pdf', savedAt: Date.now() } : null,
      );
      mount({ toolTarget: 'sign', href: '/sign?action=open' });

      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toContain('pdf1.pdf');
    });
  });

  it('adds and removes is-dragover class on drag events', () => {
    mount({});
    const dropzone = container.querySelector(`.${styles['dropzone']}`);
    expect(dropzone.classList.contains(styles['is-dragover'])).toBe(false);

    act(() => {
      dropzone.dispatchEvent(new Event('dragover', { bubbles: true }));
    });
    expect(dropzone.classList.contains(styles['is-dragover'])).toBe(true);

    act(() => {
      dropzone.dispatchEvent(new Event('dragleave', { bubbles: true }));
    });
    expect(dropzone.classList.contains(styles['is-dragover'])).toBe(false);
  });

  // toolTarget is the only mode a production caller ever uses (index.astro
  // mounts this with toolTarget="sign"), so until tests like these existed the
  // only live branch had no coverage at all and shipped a bug that overwrote
  // the user's saved Sign draft with a record the tool could not even restore.
  describe('handing a dropped file to a tool (toolTarget)', () => {
    const pdf = () => new File(['%PDF-1.4'], 'contract.pdf', { type: 'application/pdf' });

    function mountTarget() {
      mount({ toolTarget: 'sign', href: '/sign?action=open' });
      return container.querySelector(`.${styles['dropzone']}`);
    }

    it('parks the file in a handoff, never in the tool\'s draft', async () => {
      const dropzone = mountTarget();
      await dropOn(dropzone, [pdf()]);

      expect(saveHandoff).toHaveBeenCalledTimes(1);
      const [tool, record] = saveHandoff.mock.calls[0];
      expect(tool).toBe('sign');
      expect(record.fileName).toBe('contract.pdf');
      expect(record.fileType).toBe('application/pdf');
      expect(record.fileBytes.byteLength).toBeGreaterThan(0);

      // The bug this replaces: writing the drop into the draft key destroyed
      // whatever was saved there. Nothing here may touch a draft.
      expect(saveDraft).not.toHaveBeenCalled();
      expect(deleteDraft).not.toHaveBeenCalled();
    });

    // index.astro always passes `href`, so the click-to-choose picker is a
    // navigating link there in production - but FileDropzone still supports a
    // plain file input when `href` is omitted, and that path has to hand off
    // exactly the same way a drop does, reading the FileList before resetting
    // the input (see setInputFiles.js's own note on why that order matters).
    it('parks the file in a handoff when chosen via the file input too', async () => {
      mount({ toolTarget: 'sign' });
      const input = container.querySelector('input[type="file"]');

      await act(async () => {
        setInputFiles(input, [pdf()]);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(saveHandoff).toHaveBeenCalledTimes(1);
      expect(saveHandoff.mock.calls[0][0]).toBe('sign');
      expect(saveHandoff.mock.calls[0][1].fileName).toBe('contract.pdf');
      expect(input.value).toBe('');
    });

    it('asks before a drop would discard a saved draft, naming both files', async () => {
      loadDraft.mockResolvedValue({
        fileName: 'lease.pdf',
        fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
      });
      const dropzone = mountTarget();
      await dropOn(dropzone, [pdf()]);

      const dialog = container.querySelector('dialog');
      expect(dialog.textContent).toContain('contract.pdf');
      expect(dialog.textContent).toContain('lease.pdf');
      // Still nothing committed while the question is open.
      expect(saveHandoff).not.toHaveBeenCalled();
      expect(deleteDraft).not.toHaveBeenCalled();
    });

    it('leaves the draft alone when the confirmation is cancelled', async () => {
      loadDraft.mockResolvedValue({
        fileName: 'lease.pdf',
        fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
      });
      const dropzone = mountTarget();
      await dropOn(dropzone, [pdf()]);

      const cancel = [...container.querySelectorAll('button')].find(
        (button) => button.textContent.trim() === 'Cancel',
      );
      await act(async () => {
        cancel.click();
        await Promise.resolve();
      });

      expect(saveHandoff).not.toHaveBeenCalled();
      expect(deleteDraft).not.toHaveBeenCalled();
      expect(container.querySelector('dialog').open).toBeFalsy();
    });

    it('discards the draft and hands off once the user agrees', async () => {
      loadDraft.mockResolvedValue({
        fileName: 'lease.pdf',
        fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
      });
      const dropzone = mountTarget();
      await dropOn(dropzone, [pdf()]);

      const confirm = [...container.querySelectorAll('button')].find(
        (button) => button.textContent.trim() === 'Open it',
      );
      await act(async () => {
        confirm.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(deleteDraft).toHaveBeenCalledWith('sign');
      expect(saveHandoff).toHaveBeenCalledTimes(1);
      expect(saveHandoff.mock.calls[0][1].fileName).toBe('contract.pdf');
    });

    it('ignores an empty drop', async () => {
      const dropzone = mountTarget();
      await dropOn(dropzone, []);
      expect(saveHandoff).not.toHaveBeenCalled();
      expect(loadDraft).not.toHaveBeenCalled();
    });
  });
});
