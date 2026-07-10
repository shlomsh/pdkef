import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import BasePdfTool from './BasePdfTool.jsx';
import styles from './Dropzone.module.css';

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
    expect(dropzone.classList.contains(styles['has-files'])).toBe(false);
  });

  it('renders state with files', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn() });
    expect(container.textContent).not.toContain('Drop PDFs here');
    expect(container.textContent).not.toContain('Private. Files never leave your device.');
    expect(container.textContent).toContain('Add more');
    
    const dropzone = container.querySelector(`.${styles['dropzone']}`);
    expect(dropzone.classList.contains(styles['has-files'])).toBe(true);
  });

  it('renders state with files and multiple=false', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), multiple: false });
    expect(container.textContent).toContain('Choose a different file');
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

  it('handles file selection via input', () => {
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

  it('handles drag and drop events', () => {
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
});
