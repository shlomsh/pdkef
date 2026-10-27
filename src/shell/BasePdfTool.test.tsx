// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import BasePdfTool from './BasePdfTool.tsx';
// Assert state classes on purpose (Dropzone's is-dragover, ToolShell's icon-loaded); the tool card, drop overlay, identity, meta and note have no role, label or text, so they are found by class.
import { reportToolLifecycleEvent } from '../lib/productAnalytics.ts';
import { markArrival } from '../lib/fileArrival.ts';
import { setInputFiles } from '../test/support/setInputFiles.js';

vi.mock('../lib/productAnalytics.ts', () => ({ reportToolLifecycleEvent: vi.fn() }));
vi.mock('../lib/fileArrival.ts', () => ({ markArrival: vi.fn() }));

vi.mock('../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(() => new Promise(() => {})), // never settles - not under test here
}));

// The tests below are written with flat props; BasePdfTool takes them grouped.
const GROUPS = {
  intake: { multiple: 'multiple', accept: 'accept', dropAnywhere: 'dropAnywhere', needsPdfjs: 'needsPdfjs' },
  identity: { file: 'file', fileLabel: 'label', fileMeta: 'meta', fileMetaExtra: 'metaExtra', fileNote: 'note', hideIdentity: 'hidden' },
  empty: { emptyStateMessage: 'message', emptyArt: 'art', emptyHeading: 'heading', emptyBody: 'body', emptyAction: 'action', showIosFilesHint: 'iosFilesHint', showCloudDriveHint: 'cloudDriveHint' },
  draft: { draftSaveState: 'saveState', checkingDraft: 'checking' },
  analytics: { analyticsTool: 'tool', analyticsStatus: 'status', pageTool: 'pageTool' },
  owns: { ownsShell: 'shell', ownsRating: 'rating' },
};
function nest(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    const group = Object.keys(GROUPS).find((g) => key in GROUPS[g]);
    if (group) (out[group] ??= {})[GROUPS[group][key]] = value;
    else if (key === 'onClearAll') (out.clearAll ??= {}).onClear = value;
    else if (key === 'clearSummary') (out.clearAll ??= {}).summary = value;
    else out[key] = value;
  }
  return out;
}

function fileDragEvent(type, { withFiles = true, bubbles = true, files = null } = {}) {
  const event = new Event(type, { bubbles, cancelable: true });
  event.dataTransfer = {
    types: withFiles ? ['Files'] : ['text/plain'],
    // A real drop always carries at least one file; an empty list is now a
    // no-op on purpose, so the helper has to be honest about what it simulates.
    files: files || (withFiles ? [new File([''], 'dropped.pdf', { type: 'application/pdf' })] : []),
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
        <BasePdfTool {...nest(props)}>
          {props.children || null}
        </BasePdfTool>,
        container
      );
    });
  }

  describe('old browser notice', () => {
    const OLD_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';

    afterEach(() => vi.unstubAllGlobals());

    it('stays off the empty page, so an old browser can still read it', () => {
      vi.stubGlobal('navigator', { ...navigator, userAgent: OLD_CHROME });
      mount({ hasFiles: false, onFilesAdded: vi.fn() });
      expect(container.textContent).not.toContain('needs Chrome 122');
    });

    it('appears once a file is added, naming the version to update to', () => {
      vi.stubGlobal('navigator', { ...navigator, userAgent: OLD_CHROME });
      mount({ hasFiles: true, onFilesAdded: vi.fn() });
      expect(container.textContent).toContain('needs Chrome 122 or newer');
    });

    const IOS_17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

    it('is skipped for a tool that never loads pdf.js (needsPdfjs false)', () => {
      vi.stubGlobal('navigator', { ...navigator, userAgent: IOS_17 });
      mount({ hasFiles: true, onFilesAdded: vi.fn(), needsPdfjs: false });
      expect(container.textContent).not.toContain('or newer to open PDFs');
    });

    it('still appears on iOS 17 by default', () => {
      vi.stubGlobal('navigator', { ...navigator, userAgent: IOS_17 });
      mount({ hasFiles: true, onFilesAdded: vi.fn() });
      expect(container.textContent).toContain('needs iOS 18.4 or newer');
    });

    it('does not appear in a current browser', () => {
      vi.stubGlobal('navigator', { ...navigator, userAgent: OLD_CHROME.replace('109', '143') });
      mount({ hasFiles: true, onFilesAdded: vi.fn() });
      expect(container.textContent).not.toContain('or newer to open PDFs');
    });
  });

  it('renders initial state without files', () => {
    mount({ hasFiles: false, onFilesAdded: vi.fn() });
    expect(container.textContent).toContain('Drop PDFs here');
    expect(container.textContent).toContain('Choose files');
    expect(container.textContent).toContain('Private. Files never leave your device.');
    const dropzone = container.querySelector('[data-dropzone]');
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

    const placeholder = container.querySelector('[aria-busy]');
    expect(placeholder).not.toBeNull();
    expect(placeholder.getAttribute('aria-busy')).toBe('true');
  });

  it('reveals the real empty-state dropzone once checkingDraft settles to false', () => {
    mount({ hasFiles: false, onFilesAdded: vi.fn(), checkingDraft: true });
    expect(container.textContent).toContain('Checking for a saved draft');

    act(() => {
      render(
        <BasePdfTool hasFiles={false} onFilesAdded={vi.fn()} draft={{ checking: false }} />,
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
    expect(container.querySelector('[data-empty-state], [aria-busy]')).toBeNull();

    const identity = container.querySelector('[data-file-identity]');
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
    const card = container.querySelector('[data-tool-card]');
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
    const dropzone = container.querySelector('[data-empty-state]');

    act(() => {
      dropzone.dispatchEvent(new Event('dragover', { bubbles: true }));
    });
    expect(dropzone.hasAttribute('data-dragover')).toBe(true);

    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    dropEvent.dataTransfer = { files: [file] };

    act(() => {
      dropzone.dispatchEvent(dropEvent);
    });

    expect(dropzone.hasAttribute('data-dragover')).toBe(false);
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
    expect(onFilesAddedSpy.mock.calls[0][0][0]).toBe(file);
  });

  it('shows a drop overlay over the whole tool while dragging a file in the loaded state', () => {
    const onFilesAddedSpy = vi.fn();
    mount({ hasFiles: true, onFilesAdded: onFilesAddedSpy, multiple: false, fileLabel: 'contract.pdf' });
    const wrapper = container.querySelector('[data-tool-card]');

    expect(container.querySelector('[data-drop-overlay]')).toBeNull();

    act(() => {
      wrapper.dispatchEvent(fileDragEvent('dragenter'));
    });
    expect(container.querySelector('[data-drop-overlay]')).not.toBeNull();
    expect(container.textContent).toContain('Drop to replace the current file');

    const dropEvent = fileDragEvent('drop');
    act(() => {
      wrapper.dispatchEvent(dropEvent);
    });

    // The overlay always clears on drop; what happens next to the file is a
    // separate question - MEM-03: a single-file tool now always confirms
    // before it reaches onFilesAdded, so the drop lands the confirmation
    // dialog here rather than the file itself.
    expect(container.querySelector('[data-drop-overlay]')).toBeNull();
    expect(onFilesAddedSpy).not.toHaveBeenCalled();
    const dialog = dialogNamed(container, 'confirm-replace-title');
    expect(dialog.open).toBe(true);

    act(() => dialogButton(dialog, 'Replace file').click());
    expect(onFilesAddedSpy).toHaveBeenCalledTimes(1);
  });

  it('does not show the overlay for non-file drags (e.g. SortableJS reorder)', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), fileLabel: '3 PDFs' });
    const wrapper = container.querySelector('[data-tool-card]');

    act(() => {
      wrapper.dispatchEvent(fileDragEvent('dragenter', { withFiles: false }));
    });

    expect(container.querySelector('[data-drop-overlay]')).toBeNull();
  });

  it('clears the overlay when the drag leaves the window with enters unpaired', () => {
    mount({ hasFiles: true, onFilesAdded: vi.fn(), fileLabel: 'contract.pdf' });
    const wrapper = container.querySelector('[data-tool-card]');
    act(() => {
      wrapper.dispatchEvent(fileDragEvent('dragenter'));
      wrapper.dispatchEvent(fileDragEvent('dragenter'));
    });
    expect(container.querySelector('[data-drop-overlay]')).not.toBeNull();

    const leave = fileDragEvent('dragleave');
    Object.defineProperty(leave, 'relatedTarget', { value: null });
    Object.defineProperty(leave, 'clientX', { value: 0 });
    Object.defineProperty(leave, 'clientY', { value: 50 });
    act(() => {
      wrapper.dispatchEvent(leave);
    });
    expect(container.querySelector('[data-drop-overlay]')).toBeNull();
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

    const replace = container.querySelector('[data-tool-shell] button');
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

    act(() => container.querySelector('[data-tool-shell] button').click());

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

    const clear = Array.from(container.querySelectorAll('[data-tool-shell] button'))
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
    expect(container.querySelector('[data-file-identity]')).toBeNull();
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

    const icon = container.querySelector('[data-tool-shell] span[aria-hidden="true"]');
    expect(icon).not.toBeNull();
    expect(icon.hasAttribute('data-loaded')).toBe(true);
    const img = icon.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('blob:base-pdf-tool-preview');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('passes fileNote and fileMetaExtra through to the rendered shell', () => {
    mount({
      hasFiles: true,
      onFilesAdded: vi.fn(),
      multiple: false,
      fileLabel: 'a.pdf',
      fileMeta: '1 page',
      fileMetaExtra: <span data-extra>extra</span>,
      fileNote: <span data-note-content>note</span>,
    });
    expect(container.querySelector('[data-meta] [data-extra]')).not.toBeNull();
    expect(container.querySelector('[data-note] [data-note-content]')).not.toBeNull();
  });

  // Merge (and any other `multiple` tool) has its own list thumbnails, so
  // BasePdfTool drops `file` regardless of what a tool passes - see its own
  // comment above the shell context value.
  it('drops the `file` prop for `multiple` tools, keeping the glyph', () => {
    const file = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    mount({ hasFiles: true, onFilesAdded: vi.fn(), multiple: true, fileLabel: '3 PDFs', file });

    const icon = container.querySelector('[data-tool-shell] span[aria-hidden="true"]');
    expect(icon.hasAttribute('data-loaded')).toBe(false);
    expect(icon.querySelector('img')).toBeNull();
  });

  it('does not attach the drop overlay in the empty state', () => {
    mount({ hasFiles: false, onFilesAdded: vi.fn() });
    const wrapper = container.querySelector('[data-tool-card]');

    act(() => {
      wrapper.dispatchEvent(fileDragEvent('dragenter'));
    });

    expect(container.querySelector('[data-drop-overlay]')).toBeNull();
  });

  describe('drop anywhere', () => {
    const fireWindow = (e) => act(() => { window.dispatchEvent(e); });
    const card = () => container.querySelector('[data-tool-card]');

    it('marks the card data-dragging on a window file dragenter and clears on dragleave and drop', () => {
      mount({ hasFiles: false, onFilesAdded: vi.fn() });
      expect(card().hasAttribute('data-dragging')).toBe(false);
      fireWindow(fileDragEvent('dragenter'));
      expect(card().hasAttribute('data-dragging')).toBe(true);
      fireWindow(fileDragEvent('dragleave'));
      expect(card().hasAttribute('data-dragging')).toBe(false);
      fireWindow(fileDragEvent('dragenter'));
      fireWindow(fileDragEvent('drop'));
      expect(card().hasAttribute('data-dragging')).toBe(false);
    });

    it('takes a window drop with nothing loaded exactly once', () => {
      const spy = vi.fn();
      mount({ hasFiles: false, onFilesAdded: spy });
      fireWindow(fileDragEvent('dragenter'));
      fireWindow(fileDragEvent('drop'));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0][0].name).toBe('dropped.pdf');
    });

    it('handles one drop on the empty sheet once, not again at the window', () => {
      const spy = vi.fn();
      mount({ hasFiles: false, onFilesAdded: spy });
      act(() => { window.dispatchEvent(fileDragEvent('dragenter')); });
      const zone = container.querySelector('[data-empty-state]');
      act(() => { zone.dispatchEvent(fileDragEvent('drop')); });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('handles one drop on the loaded workspace once', () => {
      const spy = vi.fn();
      mount({ hasFiles: true, multiple: true, onFilesAdded: spy });
      act(() => { card().dispatchEvent(fileDragEvent('drop')); });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    describe('replacing the open file by a window drop', () => {
      const dialog = () => dialogNamed(container, 'confirm-replace-title');
      const dropOnWindow = (files) => {
        fireWindow(fileDragEvent('dragenter', { files }));
        fireWindow(fileDragEvent('drop', { files }));
      };
      const pdf = (name) => new File([''], name, { type: 'application/pdf' });

      it('asks first, naming the new file, and opens it only on Confirm', () => {
        const spy = vi.fn();
        mount({ hasFiles: true, multiple: false, onFilesAdded: spy });
        dropOnWindow([pdf('second.pdf')]);
        expect(dialog().open).toBe(true);
        expect(dialog().textContent).toContain('second.pdf');
        expect(spy).not.toHaveBeenCalled();
        act(() => dialogButton(dialog(), 'Replace file').click());
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0][0].name).toBe('second.pdf');
      });

      it('Cancel changes nothing and closes it', () => {
        const spy = vi.fn();
        mount({ hasFiles: true, multiple: false, onFilesAdded: spy });
        dropOnWindow([pdf('second.pdf')]);
        act(() => dialogButton(dialog(), 'Cancel').click());
        expect(dialog().open).toBe(false);
        expect(spy).not.toHaveBeenCalled();
      });

      it('does not ask about a file the tool would not take; the tool hears it and says so', () => {
        const spy = vi.fn();
        mount({ hasFiles: true, multiple: false, onFilesAdded: spy });
        const note = new File(['x'], 'notes.txt', { type: 'text/plain' });
        dropOnWindow([note]);
        expect(dialog().open).toBe(false);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toEqual([note]);
      });

      it('still asks about a file with no type: a real PDF from some sources has none', () => {
        const spy = vi.fn();
        mount({ hasFiles: true, multiple: false, onFilesAdded: spy });
        dropOnWindow([new File(['%PDF-1.4'], 'scan.pdf', { type: '' })]);
        expect(dialog().open).toBe(true);
        expect(spy).not.toHaveBeenCalled();
      });

      it('asks only about the acceptable files of a mixed drop', () => {
        const spy = vi.fn();
        mount({ hasFiles: true, multiple: false, onFilesAdded: spy });
        dropOnWindow([new File(['x'], 'notes.txt', { type: 'text/plain' }), pdf('second.pdf')]);
        expect(dialog().open).toBe(true);
        act(() => dialogButton(dialog(), 'Replace file').click());
        expect(spy.mock.calls[0][0].map((f) => f.name)).toEqual(['second.pdf']);
      });

      it('leaves a multiple tool alone: any file goes straight in', () => {
        const spy = vi.fn();
        mount({ hasFiles: true, multiple: true, onFilesAdded: spy });
        dropOnWindow([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
        expect(spy).toHaveBeenCalledTimes(1);
      });
    });

    it('adds no listeners with dropAnywhere={false}', () => {
      const spy = vi.fn();
      mount({ hasFiles: false, onFilesAdded: spy, dropAnywhere: false });
      fireWindow(fileDragEvent('dragenter'));
      expect(card().hasAttribute('data-dragging')).toBe(false);
      fireWindow(fileDragEvent('drop'));
      expect(spy).not.toHaveBeenCalled();
    });

    it('ignores window drops while checkingDraft is true', () => {
      const spy = vi.fn();
      mount({ hasFiles: false, onFilesAdded: spy, checkingDraft: true });
      fireWindow(fileDragEvent('dragenter'));
      const drop = fileDragEvent('drop');
      fireWindow(drop);
      expect(drop.defaultPrevented).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    });

    it('passes emptyAction into the empty state', () => {
      mount({ hasFiles: false, onFilesAdded: vi.fn(), emptyAction: <button type="button" data-testid="act">Take a photo</button> });
      expect(container.querySelector('[data-empty-state] [data-testid="act"]')).not.toBeNull();
    });

    it('renders emptyArt inside the empty state in place of the file-plus icon', () => {
      mount({ hasFiles: false, onFilesAdded: vi.fn(), emptyArt: <i data-testid="verb" /> });
      const zone = container.querySelector('[data-empty-state]');
      expect(zone.querySelector('[data-testid="verb"]')).not.toBeNull();
      expect(zone.querySelector('[data-testid="dropzone-icon"]')).toBeNull();
    });
  });

  describe('funnel events (DEBT-58)', () => {
    const calls = (name) => reportToolLifecycleEvent.mock.calls.filter(([n]) => n === name);
    afterEach(() => {
      vi.clearAllMocks();
      markArrival.mockReset();
    });

    it('sends tool_page_viewed once on mount', () => {
      mount({ hasFiles: false, onFilesAdded: vi.fn(), analyticsTool: 'sign' });
      expect(calls('tool_page_viewed')).toEqual([['tool_page_viewed', 'sign']]);
      act(() => render(<BasePdfTool hasFiles={false} onFilesAdded={vi.fn()} analytics={{ tool: 'sign' }} />, container));
      expect(calls('tool_page_viewed')).toHaveLength(1);
    });

    it('marks pick before onFilesAdded runs', () => {
      const order = [];
      markArrival.mockImplementation((s) => order.push(`mark:${s}`));
      mount({ hasFiles: false, onFilesAdded: () => order.push('added'), analyticsTool: 'sign' });
      selectFile(container.querySelector('input[type="file"]'));
      expect(order).toEqual(['mark:pick', 'added']);
    });

    it('marks drop before onFilesAdded runs', () => {
      const order = [];
      markArrival.mockImplementation((s) => order.push(`mark:${s}`));
      mount({ hasFiles: false, onFilesAdded: () => order.push('added'), analyticsTool: 'sign' });
      act(() => {
        container.querySelector('[data-empty-state]').dispatchEvent(fileDragEvent('drop'));
      });
      expect(order).toEqual(['mark:drop', 'added']);
    });

    it('marks paste before onFilesAdded runs', () => {
      const order = [];
      markArrival.mockImplementation((s) => order.push(`mark:${s}`));
      mount({ hasFiles: false, onFilesAdded: () => order.push('added'), analyticsTool: 'sign' });
      const file = new File([''], 'p.pdf', { type: 'application/pdf' });
      const event = new Event('paste', { bubbles: true, cancelable: true });
      event.clipboardData = { files: [file], items: [{ kind: 'file', getAsFile: () => file }], types: ['Files'] };
      act(() => {
        document.body.dispatchEvent(event);
      });
      expect(order).toEqual(['mark:paste', 'added']);
    });

    it('marks replace for any gesture when a single-file tool already holds a file', () => {
      const onFilesAdded = vi.fn();
      mount({ hasFiles: true, multiple: false, onFilesAdded, analyticsTool: 'sign' });
      act(() => {
        container.querySelector('[data-tool-loaded]').dispatchEvent(fileDragEvent('drop'));
      });
      act(() => dialogButton(dialogNamed(container, 'confirm-replace-title'), 'Replace file').click());
      expect(onFilesAdded).toHaveBeenCalledTimes(1);
      expect(markArrival.mock.calls).toEqual([['replace']]);
    });

    it('marks nothing when files join a multi-file list that is already loaded: no acceptance follows, so a mark would go stale', () => {
      mount({ hasFiles: true, multiple: true, onFilesAdded: vi.fn(), analyticsTool: 'merge' });
      selectFile(container.querySelector('input[type="file"]'));
      expect(markArrival).not.toHaveBeenCalled();
    });

    it('a page whose tool is only known later (Unlock/Protect) still sends its page view on mount, once', () => {
      mount({ hasFiles: false, onFilesAdded: vi.fn(), pageTool: 'unlock' });
      expect(calls('tool_page_viewed')).toEqual([['tool_page_viewed', 'unlock']]);
      act(() => render(<BasePdfTool hasFiles onFilesAdded={vi.fn()} analytics={{ pageTool: 'unlock', tool: 'protect' }} />, container));
      expect(calls('tool_page_viewed')).toHaveLength(1);
    });

    it('sends one tool_file_accepted when the file changes while loaded, none for the same file', () => {
      const a = new File([''], 'a.pdf');
      const b = new File([''], 'b.pdf');
      const props = { hasFiles: true, multiple: false, onFilesAdded: vi.fn(), analyticsTool: 'sign' };
      mount({ ...props, file: a });
      expect(calls('tool_file_accepted')).toHaveLength(1);
      const rerender = (file) => act(() => render(<BasePdfTool {...nest({ ...props, file })} />, container));
      rerender(a);
      expect(calls('tool_file_accepted')).toHaveLength(1);
      rerender(b);
      expect(calls('tool_file_accepted')).toHaveLength(2);
    });

    it('a restore sends one accepted and marks nothing', () => {
      const props = { onFilesAdded: vi.fn(), analyticsTool: 'sign', multiple: false };
      mount({ ...props, hasFiles: false, checkingDraft: true });
      act(() => render(<BasePdfTool {...nest({ ...props, hasFiles: true, checkingDraft: false, file: new File([''], 'r.pdf') })} />, container));
      expect(calls('tool_file_accepted')).toHaveLength(1);
      expect(markArrival).not.toHaveBeenCalled();
    });
  });
});
