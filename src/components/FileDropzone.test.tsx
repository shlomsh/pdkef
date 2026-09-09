// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import FileDropzone from './FileDropzone.tsx';
import { loadDraft, deleteDraft, saveDraft, saveHandoff, readDraftMeta, readRecentFiles, loadRecentFile } from '../editor/workspace/draftStore.js';
import { setInputFiles } from '../test/setInputFiles.js';

vi.mock('../editor/workspace/draftStore.js', () => ({
  attachDraftPreview: vi.fn(),
  loadDraft: vi.fn(() => Promise.resolve(null)),
  deleteDraft: vi.fn(() => Promise.resolve(true)),
  saveDraft: vi.fn(() => Promise.resolve(true)),
  saveHandoff: vi.fn(() => Promise.resolve(true)),
  readRecentFiles: vi.fn(() => []),
  loadRecentFile: vi.fn(() => Promise.resolve(null)),
  recentDisplayKey: (tool, fileName) => `${tool || ''}\u0000${(fileName || '')
    .normalize('NFC')
    .replace(/\p{Default_Ignorable_Code_Point}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()}`,
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
    readDraftMeta.mockReturnValue(null);
    readRecentFiles.mockReturnValue([]);
    loadRecentFile.mockResolvedValue(null);
    saveHandoff.mockResolvedValue(true);
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
    container.setAttribute('data-working-area', '');
    document.body.appendChild(container);
    act(() => {
      render(<FileDropzone toolTarget="sign" {...props} />, container);
    });
  }

  it('provides a keyboard-accessible compact picker for one document', () => {
    mount();
    expect(container.querySelector('[data-home-picker]').tagName).toBe('BUTTON');
    const input = container.querySelector('input[type="file"]');
    expect(input.multiple).toBe(false);
    expect(input.accept).toContain('application/pdf');
  });

  describe('resume-draft card', () => {
    it('offers the bundled sample in the recent-documents position when no draft exists', () => {
      readDraftMeta.mockReturnValue(null);
      mount({ toolTarget: 'sign', href: '/sign?action=open' });
      const sample = container.querySelector('button[aria-label^="Open bundled sample PDF"]');
      expect(sample).not.toBeNull();
      expect(sample.textContent).toContain('PDkef practice form.pdf');
      expect(sample.textContent).toContain('Sign & Fill PDF');
      expect(sample.textContent).not.toContain('Bundled sample');
      expect(sample.textContent).not.toContain('Open sample');
      expect(sample.querySelector('img[src="/images/redaction-guide/sample-preview.jpg"]')).not.toBeNull();
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
      expect(continueLink.textContent).toContain('contract.pdf');
      expect(container.querySelector('button[aria-label^="Open bundled sample PDF"]')).toBeNull();

      // The card already made the case for resuming; the dropzone below
      // shouldn't repeat the from-scratch pitch as if the card said nothing.
      expect(container.textContent).not.toContain('Drop PDFs here');
      expect(container.textContent).toContain('or drop PDFs here');
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

    it('shows no more than six cached files, newest first', () => {
      const now = Date.now();
      readRecentFiles.mockReturnValue(Array.from({ length: 8 }, (_, index) => ({
        id: `cached-${index}`,
        tool: index % 2 ? 'redact' : 'sign',
        fileName: `recent-${index}.pdf`,
        savedAt: now - index,
      })));
      mount();

      const names = Array.from(container.querySelectorAll('li')).map((li) => li.textContent);
      expect(names).toHaveLength(6);
      expect(names[0]).toContain('recent-0.pdf');
      expect(names[5]).toContain('recent-5.pdf');
      expect(container.textContent).not.toContain('recent-6.pdf');
    });

    it('does not add a legacy draft when its filename differs only by iOS direction marks', () => {
      readRecentFiles.mockReturnValue([{
        id: 'cached-id', tool: 'sign', fileName: '\u200Fספח תעודת זהות.pdf', savedAt: Date.now(),
      }]);
      readDraftMeta.mockImplementation((tool) => tool === 'sign'
        ? { fileName: 'ספח תעודת זהות.pdf', savedAt: Date.now() - 1_000 }
        : null);
      mount();

      expect(container.querySelectorAll('li')).toHaveLength(1);
    });

    it('resumes the active draft instead of asking to replace it from its own recent card', async () => {
      readRecentFiles.mockReturnValue([{
        id: 'sha256:active', tool: 'sign', fileName: 'contract.pdf', savedAt: Date.now(),
      }]);
      loadRecentFile.mockResolvedValue({
        tool: 'sign', fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes: new ArrayBuffer(8),
      });
      loadDraft.mockResolvedValue({
        sourceId: 'sha256:active', fileName: 'contract.pdf', fileBytes: new ArrayBuffer(8),
      });
      mount();
      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        container.querySelector('button[aria-label^="Open recent PDF"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.querySelector('dialog').open).toBe(false);
      expect(deleteDraft).not.toHaveBeenCalled();
      expect(saveHandoff).not.toHaveBeenCalled();
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

  it('indicates file drags across the whole working area', () => {
    mount();
    const event = new Event('dragover', { bubbles: true, cancelable: true });
    event.dataTransfer = { types: ['Files'] };
    act(() => container.dispatchEvent(event));
    expect(container.hasAttribute('data-drag-over')).toBe(true);
    act(() => container.dispatchEvent(new Event('dragleave', { bubbles: true })));
    expect(container.hasAttribute('data-drag-over')).toBe(false);
  });

  // toolTarget is the only mode a production caller ever uses (index.astro
  // mounts this with toolTarget="sign"), so until tests like these existed the
  // only live branch had no coverage at all and shipped a bug that overwrote
  // the user's saved Sign draft with a record the tool could not even restore.
  describe('handing a dropped file to a tool (toolTarget)', () => {
    const pdf = () => new File(['%PDF-1.4'], 'contract.pdf', { type: 'application/pdf' });

    function mountTarget() {
      mount({ toolTarget: 'sign', href: '/sign?action=open' });
      return container;
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
    it('does not discard a draft if handoff storage fails', async () => {
      loadDraft.mockResolvedValue({ fileName: 'lease.pdf', fileBytes: new ArrayBuffer(8) });
      saveHandoff.mockResolvedValue(false);
      const area = mountTarget();
      await dropOn(area, [pdf()]);
      await act(async () => {
        [...container.querySelectorAll('button')].find(button => button.textContent.trim() === 'Open it').click();
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(deleteDraft).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not save this file');
    });

    it('does not silently discard extra dropped documents', async () => {
      const area = mountTarget();
      await dropOn(area, [pdf(), pdf()]);
      expect(saveHandoff).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]').textContent).toContain('Merge PDF');
    });

  });
});
