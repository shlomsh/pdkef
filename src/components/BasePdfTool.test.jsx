import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import BasePdfTool from './BasePdfTool.jsx';
import styles from './Dropzone.module.css';
import pdfToolStyles from './PdfTool.module.css';

function fileDragEvent(type, { withFiles = true, bubbles = true } = {}) {
  const event = new Event(type, { bubbles, cancelable: true });
  event.dataTransfer = {
    types: withFiles ? ['Files'] : ['text/plain'],
    files: [],
  };
  return event;
}

describe('BasePdfTool', () => {
  let container;

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
      render(
        <BasePdfTool {...props}>
          {props.children || null}
        </BasePdfTool>,
        container
      );
    });
  }

  it('renders initial state without files', () => {
    mount({ hasFiles: false, onFilesAdded: vi.fn() });
    expect(container.textContent).toContain('Drop PDFs here');
    expect(container.textContent).toContain('Choose files');
    expect(container.textContent).toContain('Private. Files never leave your device.');
    const dropzone = container.querySelector(`.${styles['dropzone']}`);
    expect(dropzone).not.toBeNull();
  });

  it('renders the loaded-state file bar instead of the dropzone', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), fileLabel: 'contract.pdf' });
    expect(container.textContent).not.toContain('Drop PDF');
    expect(container.textContent).not.toContain('Private. Files never leave your device.');
    expect(container.querySelector(`.${styles['dropzone']}`)).toBeNull();

    const fileBar = container.querySelector(`.${styles['file-bar']}`);
    expect(fileBar).not.toBeNull();
    expect(fileBar.textContent).toContain('contract.pdf');
    expect(container.textContent).toContain('Add files');
  });

  it('renders "Replace file" for single-file tools and "Add files" for multi-file tools', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), multiple: false, fileLabel: 'contract.pdf' });
    expect(container.textContent).toContain('Replace file');
    expect(container.textContent).not.toContain('Add files');
  });

  it('falls back to a generic label when fileLabel is omitted', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), multiple: false });
    expect(container.textContent).toContain('PDF loaded');
  });

  it('shows file metadata and the draft-saved indicator when provided', () => {
    mount({
      hasFiles: true,
      onFilesAdded: vi.fn(),
      multiple: false,
      fileLabel: 'contract.pdf',
      fileMeta: '2 pages · 1.4 MB',
      draftSaved: true,
    });
    expect(container.textContent).toContain('2 pages · 1.4 MB');
    expect(container.textContent).toContain('Draft saved');
  });

  it('renders children', () => {
    mount({
      hasFiles: false,
      onFilesAdded: vi.fn(),
      children: <div class="test-child">Child Content</div>
    });
    const child = container.querySelector('.test-child');
    expect(child).not.toBeNull();
    expect(child.textContent).toBe('Child Content');
  });

  it('handles file selection via input in the empty state', () => {
    const onFilesAddedSpy = vi.fn();
    mount({ hasFiles: false, onFilesAdded: onFilesAddedSpy });

    const input = container.querySelector('input[type="file"]');
    const file = new File([''], 'test.pdf', { type: 'application/pdf' });

    act(() => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
    expect(onFilesAddedSpy.mock.calls[0][0][0]).toBe(file);
    expect(input.value).toBe('');
  });

  it('handles file selection via input in the loaded state', () => {
    const onFilesAddedSpy = vi.fn();
    mount({ hasFiles: true, onFilesAdded: onFilesAddedSpy, multiple: false, fileLabel: 'contract.pdf' });

    const input = container.querySelector('input[type="file"]');
    const file = new File([''], 'replacement.pdf', { type: 'application/pdf' });

    act(() => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
    expect(onFilesAddedSpy.mock.calls[0][0][0]).toBe(file);
  });

  it('handles drag and drop on the empty-state dropzone', () => {
    const onFilesAddedSpy = vi.fn();
    mount({ hasFiles: false, onFilesAdded: onFilesAddedSpy });
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
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
    expect(onFilesAddedSpy.mock.calls[0][0][0]).toBe(file);
  });

  it('shows a drop overlay over the whole tool while dragging a file in the loaded state', () => {
    const onFilesAddedSpy = vi.fn();
    mount({ hasFiles: true, onFilesAdded: onFilesAddedSpy, multiple: false, fileLabel: 'contract.pdf' });
    const wrapper = container.querySelector(`.${pdfToolStyles['merge-tool']}`);

    expect(container.querySelector(`.${styles['drop-overlay']}`)).toBeNull();

    act(() => {
      wrapper.dispatchEvent(fileDragEvent('dragenter'));
    });
    expect(container.querySelector(`.${styles['drop-overlay']}`)).not.toBeNull();
    expect(container.textContent).toContain('Drop to replace the current file');

    const dropEvent = fileDragEvent('drop');
    act(() => {
      wrapper.dispatchEvent(dropEvent);
    });

    expect(container.querySelector(`.${styles['drop-overlay']}`)).toBeNull();
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
  });

  it('does not show the overlay for non-file drags (e.g. SortableJS reorder)', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), fileLabel: '3 PDFs' });
    const wrapper = container.querySelector(`.${pdfToolStyles['merge-tool']}`);

    act(() => {
      wrapper.dispatchEvent(fileDragEvent('dragenter', { withFiles: false }));
    });

    expect(container.querySelector(`.${styles['drop-overlay']}`)).toBeNull();
  });

  it('does not attach the drop overlay in the empty state', () => {
    mount({ hasFiles: false, onFilesAdded: vi.fn() });
    const wrapper = container.querySelector(`.${pdfToolStyles['merge-tool']}`);

    act(() => {
      wrapper.dispatchEvent(fileDragEvent('dragenter'));
    });

    expect(container.querySelector(`.${styles['drop-overlay']}`)).toBeNull();
  });
});
