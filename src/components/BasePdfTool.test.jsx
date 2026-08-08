import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import BasePdfTool from './BasePdfTool.jsx';
import styles from './Dropzone.module.css';
import toolShellStyles from './ToolShell.module.css';
import pdfToolStyles from './PdfTool.module.css';

function fileDragEvent(type, { withFiles = true, bubbles = true } = {}) {
  const event = new Event(type, { bubbles, cancelable: true });
  event.dataTransfer = {
    types: withFiles ? ['Files'] : ['text/plain'],
    // A real drop always carries at least one file; an empty list is now a
    // no-op on purpose, so the helper has to be honest about what it simulates.
    files: withFiles ? [new File([''], 'dropped.pdf', { type: 'application/pdf' })] : [],
  };
  return event;
}

function selectFile(input, name = 'replacement.pdf') {
  const file = new File([''], name, { type: 'application/pdf' });
  act(() => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return file;
}

function dialogNamed(container, id) {
  return container.querySelector(`dialog[aria-labelledby="${id}"]`);
}

function dialogButton(dialog, label) {
  return Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent.trim() === label);
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

  it('renders the loaded-state identity line instead of the dropzone', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), fileLabel: 'contract.pdf' });
    expect(container.textContent).not.toContain('Drop PDF');
    expect(container.textContent).not.toContain('Private. Files never leave your device.');
    expect(container.querySelector(`.${styles['dropzone']}`)).toBeNull();

    const identity = container.querySelector(`.${toolShellStyles.identity}`);
    expect(identity).not.toBeNull();
    expect(identity.textContent).toContain('contract.pdf');
    // Read-only: the identity states what is loaded and offers no way to act on it.
    expect(identity.querySelector('button')).toBeNull();
    expect(identity.querySelector('a')).toBeNull();
    expect(identity.querySelector('input')).toBeNull();
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

  // The gate that closed the drift: six of nine tools used to discard the user's
  // work on a file swap with no warning at all, and the three that did ask each
  // asked differently. One component decides now, from declared config.
  it('asks BEFORE opening the picker when Replace is pressed', () => {
    const onFilesAddedSpy = vi.fn();
    mount({
      hasFiles: true,
      onFilesAdded: onFilesAddedSpy,
      multiple: false,
      fileLabel: 'contract.pdf',
      hasWork: true,
      workNoun: 'your annotations',
    });

    const input = container.querySelector('input[type="file"]');
    const openedPicker = vi.spyOn(input, 'click');

    const replace = container.querySelector(`.${toolShellStyles.action}`);
    act(() => replace.click());

    // The point of the ordering: the warning arrives before the trip through
    // the OS picker, not after it.
    const dialog = dialogNamed(container, 'confirm-replace-title');
    expect(dialog.open).toBe(true);
    expect(openedPicker).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain('Choosing another file closes');
    expect(dialog.textContent).toContain('contract.pdf');
    expect(dialog.textContent).toContain('discards your annotations');

    act(() => dialogButton(dialog, 'Cancel').click());
    expect(dialog.open).toBe(false);
    expect(openedPicker).not.toHaveBeenCalled();

    act(() => replace.click());
    act(() => dialogButton(dialog, 'Choose a file').click());
    expect(openedPicker).toHaveBeenCalledTimes(1);

    // Having just agreed, the file that comes back must not be queried again.
    selectFile(input);
    expect(dialogNamed(container, 'confirm-replace-title').open).toBe(false);
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
  });

  it('opens the picker straight away when a replacement costs nothing', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), multiple: false, fileLabel: 'contract.pdf' });
    const openedPicker = vi.spyOn(container.querySelector('input[type="file"]'), 'click');

    act(() => container.querySelector(`.${toolShellStyles.action}`).click());

    expect(dialogNamed(container, 'confirm-replace-title').open).toBe(false);
    expect(openedPicker).toHaveBeenCalledTimes(1);
  });

  it('asks about a dropped file by name, since that one arrives already chosen', () => {
    const onFilesAddedSpy = vi.fn();
    mount({
      hasFiles: true,
      onFilesAdded: onFilesAddedSpy,
      multiple: false,
      fileLabel: 'contract.pdf',
      hasWork: true,
      workNoun: 'your annotations',
    });

    const incoming = selectFile(container.querySelector('input[type="file"]'));
    expect(onFilesAddedSpy).not.toHaveBeenCalled();

    const dialog = dialogNamed(container, 'confirm-replace-title');
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('replacement.pdf');
    expect(dialog.textContent).toContain('contract.pdf');
    expect(dialog.textContent).toContain('discards your annotations');

    act(() => dialogButton(dialog, 'Cancel').click());
    expect(dialog.open).toBe(false);
    expect(onFilesAddedSpy).not.toHaveBeenCalled();

    selectFile(container.querySelector('input[type="file"]'));
    act(() => dialogButton(dialog, 'Replace file').click());
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
    expect(onFilesAddedSpy.mock.calls[0][0][0].name).toBe(incoming.name);
  });

  it('mentions the saved draft only when there is one to lose', () => {
    mount({
      hasFiles: true,
      onFilesAdded: vi.fn(),
      multiple: false,
      fileLabel: 'contract.pdf',
      hasWork: true,
      draftSaved: true,
    });

    selectFile(container.querySelector('input[type="file"]'));
    expect(dialogNamed(container, 'confirm-replace-title').textContent).toContain('Your saved draft goes with it.');
  });

  it('skips the prompt when nothing has been done to the file yet', () => {
    const onFilesAddedSpy = vi.fn();
    mount({ hasFiles: true, onFilesAdded: onFilesAddedSpy, multiple: false, fileLabel: 'contract.pdf' });

    selectFile(container.querySelector('input[type="file"]'));
    expect(dialogNamed(container, 'confirm-replace-title').open).toBe(false);
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
  });

  it('never prompts a list tool for adding files, but does for clearing them', () => {
    const onFilesAddedSpy = vi.fn();
    const onClearAllSpy = vi.fn();
    mount({
      hasFiles: true,
      onFilesAdded: onFilesAddedSpy,
      onClearAll: onClearAllSpy,
      clearSummary: '3 PDFs',
      fileLabel: '3 PDFs',
      hasWork: true,
    });

    selectFile(container.querySelector('input[type="file"]'));
    expect(dialogNamed(container, 'confirm-replace-title').open).toBe(false);
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);

    const clear = Array.from(container.querySelectorAll(`.${toolShellStyles.action}`))
      .find((button) => button.textContent.includes('Clear all'));
    act(() => clear.click());

    const dialog = dialogNamed(container, 'confirm-clear-title');
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('3 PDFs');
    expect(onClearAllSpy).not.toHaveBeenCalled();

    act(() => dialogButton(dialog, 'Clear all').click());
    expect(onClearAllSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves the shell to the tool when it mounts one itself', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), multiple: false, fileLabel: 'contract.pdf', ownsShell: true });
    expect(container.querySelector(`.${toolShellStyles.identity}`)).toBeNull();
    // The picker behind it still belongs to BasePdfTool, so the tool's own
    // Replace control has something to open.
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
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
