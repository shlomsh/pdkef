import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import FileDropzone from './FileDropzone.jsx';

describe('FileDropzone', () => {
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
    const dropzone = container.querySelector('.dropzone');
    expect(dropzone.classList.contains('is-dragover')).toBe(false);

    act(() => {
      dropzone.dispatchEvent(new Event('dragover', { bubbles: true }));
    });
    expect(dropzone.classList.contains('is-dragover')).toBe(true);

    act(() => {
      dropzone.dispatchEvent(new Event('dragleave', { bubbles: true }));
    });
    expect(dropzone.classList.contains('is-dragover')).toBe(false);
  });

  it('calls onFiles when files are dropped', () => {
    const onFilesSpy = vi.fn();
    mount({ onFiles: onFilesSpy });
    const dropzone = container.querySelector('.dropzone');

    act(() => {
      dropzone.dispatchEvent(new Event('dragover', { bubbles: true }));
    });
    expect(dropzone.classList.contains('is-dragover')).toBe(true);

    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    dropEvent.dataTransfer = { files: [file] };

    act(() => {
      dropzone.dispatchEvent(dropEvent);
    });

    expect(dropzone.classList.contains('is-dragover')).toBe(false);
    expect(onFilesSpy).toHaveBeenCalledTimes(1);
    expect(onFilesSpy.mock.calls[0][0][0]).toBe(file);
  });
});
