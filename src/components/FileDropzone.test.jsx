import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import FileDropzone from './FileDropzone.jsx';
import styles from './Dropzone.module.css';
import { loadDraft, deleteDraft, saveDraft, saveHandoff } from '../lib/draftStore.js';

vi.mock('../lib/draftStore.js', () => ({
  loadDraft: vi.fn(() => Promise.resolve(null)),
  deleteDraft: vi.fn(() => Promise.resolve(true)),
  saveDraft: vi.fn(() => Promise.resolve(true)),
  saveHandoff: vi.fn(() => Promise.resolve(true)),
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
    mount({ onFiles: vi.fn() });
    expect(container.textContent).toContain('Drop PDFs here');
    expect(container.textContent).toContain('Choose files');
    const input = container.querySelector('input[type="file"]');
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('application/pdf');
  });

  it('renders correctly with multiple=false', () => {
    mount({ onFiles: vi.fn(), multiple: false });
    expect(container.textContent).toContain('Drop PDF here');
    expect(container.textContent).toContain('Choose file');
    const input = container.querySelector('input[type="file"]');
    expect(input.multiple).toBe(false);
  });

  // The homepage CTA (`index.astro`) mounts FileDropzone with an `href`, which
  // renders the picker as a navigating anchor instead of a file <input> label.
  it('renders the picker as an anchor (no file input) when href is set', () => {
    mount({ onFiles: vi.fn(), href: '/sign?action=open' });
    const link = container.querySelector(`a.${styles['file-picker-button']}`);
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/sign?action=open');
    expect(link.textContent).toContain('Choose files');
    // In href mode there is no hidden file input.
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('calls onFiles when a file is selected via input', () => {
    const onFilesSpy = vi.fn();
    mount({ onFiles: onFilesSpy });

    const input = container.querySelector('input[type="file"]');
    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    
    act(() => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onFilesSpy).toHaveBeenCalledTimes(1);
    expect(onFilesSpy.mock.calls[0][0][0]).toBe(file);
    expect(input.value).toBe(''); // it resets the input
  });

  it('adds and removes is-dragover class on drag events', () => {
    mount({ onFiles: vi.fn() });
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

  it('calls onFiles when files are dropped', () => {
    const onFilesSpy = vi.fn();
    mount({ onFiles: onFilesSpy });
    const dropzone = container.querySelector(`.${styles['dropzone']}`);

    act(() => {
      dropzone.dispatchEvent(new Event('dragover', { bubbles: true }));
    });
    expect(dropzone.classList.contains(styles['is-dragover'])).toBe(true);

    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    dropEvent.dataTransfer = { files: [file] };

    act(() => {
      dropzone.dispatchEvent(dropEvent);
    });

    expect(dropzone.classList.contains(styles['is-dragover'])).toBe(false);
    expect(onFilesSpy).toHaveBeenCalledTimes(1);
    expect(onFilesSpy.mock.calls[0][0][0]).toBe(file);
  });

  // The mode the home page actually ships. Everything above drives `onFiles`,
  // which no production caller passes - index.astro mounts this with
  // `onFiles={null}` and `toolTarget="sign"`, so until these tests existed the
  // only live branch had no coverage at all and shipped a bug that overwrote the
  // user's saved Sign draft with a record the tool could not even restore.
  describe('handing a dropped file to a tool (toolTarget)', () => {
    const pdf = () => new File(['%PDF-1.4'], 'contract.pdf', { type: 'application/pdf' });

    function mountTarget() {
      mount({ onFiles: null, toolTarget: 'sign', href: '/sign?action=open' });
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
