// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import BasePdfTool from './BasePdfTool.tsx';
import styles from './Dropzone.module.css';
import toolShellStyles from './ToolShell.module.css';
import pdfToolStyles from './PdfTool.module.css';
import { setInputFiles } from '../test/setInputFiles.js';

vi.mock('../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(() => new Promise(() => {})), // never settles - not under test here
}));

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
    setInputFiles(input, [file]);
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
    // Marks this as the real empty-state invitation, distinct from the
    // checking-draft placeholder below - see Dropzone.module.css's
    // `html[data-draft-hint] .dropzone[data-empty-state]` pre-hydration gate.
    expect(dropzone.hasAttribute('data-empty-state')).toBe(true);
  });

  // A tool with draft persistence (Sign, Redact) passes checkingDraft while it
  // is still deciding whether a saved draft exists - see useDraftPersistence.js's
  // isRestoring. The empty-state "add a file" invitation must not appear during
  // that window, since a file may be about to load over it.
  it('shows a neutral placeholder instead of the empty-state dropzone while checkingDraft is true', () => {
    mount({ hasFiles: false, onFilesAdded: vi.fn(), checkingDraft: true });

    expect(container.textContent).not.toContain('Drop PDF');
    expect(container.textContent).not.toContain('Choose file');
    expect(container.textContent).toContain('Checking for a saved draft');
    // No empty-state dropzone at all while checking - not even a hidden one.
    expect(container.querySelector('[data-empty-state]')).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();

    const placeholder = container.querySelector(`.${styles['dropzone']}`);
    expect(placeholder).not.toBeNull();
    expect(placeholder.getAttribute('aria-busy')).toBe('true');
  });

  it('reveals the real empty-state dropzone once checkingDraft settles to false', () => {
    mount({ hasFiles: false, onFilesAdded: vi.fn(), checkingDraft: true });
    expect(container.textContent).toContain('Checking for a saved draft');

    act(() => {
      render(
        <BasePdfTool hasFiles={false} onFilesAdded={vi.fn()} checkingDraft={false} />,
        container
      );
    });

    expect(container.textContent).not.toContain('Checking for a saved draft');
    expect(container.textContent).toContain('Drop PDFs here');
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
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
      draftSaveState: 'saved',
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
      setInputFiles(input, [file]);
    });

    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
    expect(onFilesAddedSpy.mock.calls[0][0][0]).toBe(file);
    expect(input.value).toBe('');
  });

  it('accepts files pasted with Cmd/Ctrl+V and leaves text pastes and form fields alone (MERGE-10)', () => {
    const onFilesAddedSpy = vi.fn();
    mount({ hasFiles: true, onFilesAdded: onFilesAddedSpy, multiple: true });
    const file = new File([''], 'pasted.pdf', { type: 'application/pdf' });

    const paste = (target, files) => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files } });
      target.dispatchEvent(event);
      return event;
    };

    act(() => { paste(document.body, []); });
    expect(onFilesAddedSpy).not.toHaveBeenCalled();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    act(() => { paste(textarea, [file]); });
    expect(onFilesAddedSpy).not.toHaveBeenCalled();
    textarea.remove();

    let event;
    act(() => { event = paste(document.body, [file]); });
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
    expect(onFilesAddedSpy.mock.calls[0][0]).toEqual([file]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('walks a dropped folder before handing its files on (MERGE-10)', async () => {
    const onFilesAddedSpy = vi.fn();
    mount({ hasFiles: true, onFilesAdded: onFilesAddedSpy, multiple: true });
    const inside = ['b 2.pdf', 'a 10.pdf'].map((name) => new File([''], name, { type: 'application/pdf' }));
    let served = false;
    const folder = {
      isFile: false,
      isDirectory: true,
      createReader: () => ({ readEntries: (resolve) => { if (served) return resolve([]); served = true; resolve(inside.map((f) => ({ isFile: true, isDirectory: false, file: (r) => r(f) }))); } }),
    };
    const card = container.querySelector(`.${pdfToolStyles['tool-card']}`);
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [], items: [{ webkitGetAsEntry: () => folder }] } });
    await act(async () => {
      card.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
    expect(onFilesAddedSpy.mock.calls[0][0].map((f) => f.name)).toEqual(['a 10.pdf', 'b 2.pdf']);
  });

  // MEM-03: a single-file tool now always confirms a replacement (see the
  // Replace-dialog tests below), so this proves the plain input-change wiring
  // on a `multiple` tool instead - Add still costs nothing regardless, and the
  // mechanism (receiveFiles reading the FileList and handing it to
  // onFilesAdded) is the same one a single-file tool uses once agreed to.
  it('handles file selection via input in the loaded state', () => {
    const onFilesAddedSpy = vi.fn();
    mount({ hasFiles: true, onFilesAdded: onFilesAddedSpy, multiple: true, fileLabel: '3 PDFs' });

    const input = container.querySelector('input[type="file"]');
    const file = new File([''], 'replacement.pdf', { type: 'application/pdf' });

    act(() => {
      setInputFiles(input, [file]);
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
    const wrapper = container.querySelector(`.${pdfToolStyles['tool-card']}`);

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

    // The overlay always clears on drop; what happens next to the file is a
    // separate question - MEM-03: a single-file tool now always confirms
    // before it reaches onFilesAdded, so the drop lands the confirmation
    // dialog here rather than the file itself.
    expect(container.querySelector(`.${styles['drop-overlay']}`)).toBeNull();
    expect(onFilesAddedSpy).not.toHaveBeenCalled();
    const dialog = dialogNamed(container, 'confirm-replace-title');
    expect(dialog.open).toBe(true);

    act(() => dialogButton(dialog, 'Replace file').click());
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
  });

  it('does not show the overlay for non-file drags (e.g. SortableJS reorder)', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), fileLabel: '3 PDFs' });
    const wrapper = container.querySelector(`.${pdfToolStyles['tool-card']}`);

    act(() => {
      wrapper.dispatchEvent(fileDragEvent('dragenter', { withFiles: false }));
    });

    expect(container.querySelector(`.${styles['drop-overlay']}`)).toBeNull();
  });

  // The gate that closed the drift: six of nine tools used to discard the user's
  // work on a file swap with no warning at all, and the three that did ask each
  // asked differently. One component decides now, from declared config.
  //
  // MEM-03 (2026-09-15): the 2026-08-08 rule this test used to prove - confirm
  // only when hasWork - is superseded. The dialog's meaning changed: it no
  // longer protects work about to be destroyed (nothing is; the current file
  // moves to recents, it doesn't close), it just catches an unintended click,
  // so it asks every time regardless of hasWork. `hasWork: true` is passed
  // below anyway to prove it no longer has any effect on whether this opens.
  it('asks BEFORE opening the picker when Replace is pressed, whether or not there is work to lose', () => {
    const onFilesAddedSpy = vi.fn();
    mount({
      hasFiles: true,
      onFilesAdded: onFilesAddedSpy,
      multiple: false,
      fileLabel: 'contract.pdf',
    });

    const input = container.querySelector('input[type="file"]');
    const openedPicker = vi.spyOn(input, 'click');

    const replace = container.querySelector(`.${toolShellStyles.action}`);
    act(() => replace.click());

    // The point of the ordering: the question arrives before the trip through
    // the OS picker, not after it.
    const dialog = dialogNamed(container, 'confirm-replace-title');
    expect(dialog.open).toBe(true);
    expect(openedPicker).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain('This closes');
    expect(dialog.textContent).toContain('contract.pdf');
    expect(dialog.textContent).toContain('recent files');

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

  // Direct proof of the change: this used to be "opens the picker straight
  // away when a replacement costs nothing" - hasWork defaulting to false used
  // to skip the dialog entirely. It no longer does; see costsSomething in
  // BasePdfTool.tsx.
  it('still asks before opening the picker with nothing done to the file yet', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), multiple: false, fileLabel: 'contract.pdf' });
    const openedPicker = vi.spyOn(container.querySelector('input[type="file"]'), 'click');

    act(() => container.querySelector(`.${toolShellStyles.action}`).click());

    expect(dialogNamed(container, 'confirm-replace-title').open).toBe(true);
    expect(openedPicker).not.toHaveBeenCalled();
  });

  it('asks about a dropped file by name, since that one arrives already chosen', () => {
    const onFilesAddedSpy = vi.fn();
    mount({
      hasFiles: true,
      onFilesAdded: onFilesAddedSpy,
      multiple: false,
      fileLabel: 'contract.pdf',
    });

    const incoming = selectFile(container.querySelector('input[type="file"]'));
    expect(onFilesAddedSpy).not.toHaveBeenCalled();

    const dialog = dialogNamed(container, 'confirm-replace-title');
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Opening replacement.pdf');
    expect(dialog.textContent).toContain('contract.pdf');
    expect(dialog.textContent).toContain('recent files');

    act(() => dialogButton(dialog, 'Cancel').click());
    expect(dialog.open).toBe(false);
    expect(onFilesAddedSpy).not.toHaveBeenCalled();

    selectFile(container.querySelector('input[type="file"]'));
    act(() => dialogButton(dialog, 'Replace file').click());
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
    expect(onFilesAddedSpy.mock.calls[0][0][0].name).toBe(incoming.name);
  });

  // MEM-03: "Your saved draft goes with it.", conditional on
  // draftSaveState === 'saved', is gone - the sentence always says the
  // closed file stays in recents now, whether or not a save has landed yet.
  // Replaces the old "mentions the saved draft only when there is one to
  // lose" test, which existed only to prove that condition.
  it('always says the closed file stays in recent files, regardless of save state', () => {
    mount({
      hasFiles: true,
      onFilesAdded: vi.fn(),
      multiple: false,
      fileLabel: 'contract.pdf',
      draftSaveState: 'idle',
    });

    selectFile(container.querySelector('input[type="file"]'));
    expect(dialogNamed(container, 'confirm-replace-title').textContent).toContain('recent files');
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

  // SEO-19 follow-up (Shlomi, 2026-09-12): a single-file tool can now pass the
  // File itself through to the shell so the identity row shows a thumbnail
  // instead of the generic glyph (see FilePreview.tsx). This only proves the
  // prop reaches the shell and renders something in place of the glyph -
  // FilePreview.test.tsx owns the image/PDF/reject/no-file behaviour itself.
  it('passes a `file` prop through to the shell, which renders a preview instead of the glyph', () => {
    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:base-pdf-tool-preview');

    const file = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    mount({ hasFiles: true, onFilesAdded: vi.fn(), multiple: false, fileLabel: 'photo.jpg', file });

    const icon = container.querySelector(`.${toolShellStyles.icon}`);
    expect(icon).not.toBeNull();
    expect(icon.classList.contains(toolShellStyles['icon-loaded'])).toBe(true);
    const img = icon.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('blob:base-pdf-tool-preview');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  // Merge (and any other `multiple` tool) has its own list thumbnails, so
  // BasePdfTool drops `file` regardless of what a tool passes - see its own
  // comment above the shell context value.
  it('drops the `file` prop for `multiple` tools, keeping the glyph', () => {
    const file = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    mount({ hasFiles: true, onFilesAdded: vi.fn(), multiple: true, fileLabel: '3 PDFs', file });

    const icon = container.querySelector(`.${toolShellStyles.icon}`);
    expect(icon.classList.contains(toolShellStyles['icon-loaded'])).toBe(false);
    expect(icon.querySelector('img')).toBeNull();
  });

  it('does not attach the drop overlay in the empty state', () => {
    mount({ hasFiles: false, onFilesAdded: vi.fn() });
    const wrapper = container.querySelector(`.${pdfToolStyles['tool-card']}`);

    act(() => {
      wrapper.dispatchEvent(fileDragEvent('dragenter'));
    });

    expect(container.querySelector(`.${styles['drop-overlay']}`)).toBeNull();
  });
});
