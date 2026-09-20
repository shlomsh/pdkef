// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import FileDropzone from './FileDropzone.tsx';
import { saveDraft, saveHandoff, setCurrentEntry, readRecentFiles, loadRecentFile } from '../lib/drafts/draftStore.js';
import { setInputFiles } from '../test/setInputFiles.js';

vi.mock('../lib/drafts/draftStore.js', () => ({
  saveDraft: vi.fn(() => Promise.resolve(true)),
  saveHandoff: vi.fn(() => Promise.resolve(true)),
  setCurrentEntry: vi.fn(),
  readRecentFiles: vi.fn(() => []),
  loadRecentFile: vi.fn(() => Promise.resolve(null)),
}));

function dropOn(dropzone, files) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = { files };
  return act(async () => {
    dropzone.dispatchEvent(event);
    // The handoff path is async (file.arrayBuffer(), then saveHandoff) before it commits.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('FileDropzone', () => {
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('recent-file card', () => {
    it('offers the bundled sample when there are no recent files', () => {
      mount({ toolTarget: 'sign', href: '/sign?action=open' });
      const sample = container.querySelector('button[aria-label^="Open bundled sample PDF"]');
      expect(sample).not.toBeNull();
      expect(sample.textContent).toContain('PDkef practice form.pdf');
      expect(sample.textContent).toContain('Sign & Fill PDF');
      expect(sample.textContent).not.toContain('Bundled sample');
      expect(sample.textContent).not.toContain('Open sample');
      expect(sample.querySelector('img[src="/images/redaction-guide/sample-preview.jpg"]')).not.toBeNull();
    });

    it('shows one cached source once', () => {
      readRecentFiles.mockReturnValue([{
        id: 'sha256:contract', tool: 'sign', fileName: 'contract.pdf',
        savedAt: Date.now() - 60_000, preview: 'data:image/jpeg;base64,abc',
      }]);
      mount({ toolTarget: 'sign', href: '/sign?action=open' });

      expect(container.querySelectorAll('li')).toHaveLength(1);
      expect(container.textContent).toContain('contract.pdf');
      expect(container.textContent).toContain('Sign & Fill PDF');
      expect(container.querySelector('img[src="data:image/jpeg;base64,abc"]')).not.toBeNull();
      expect(container.querySelector('button[aria-label^="Open recent PDF"]')).not.toBeNull();
      expect(container.querySelector('button[aria-label^="Open bundled sample PDF"]')).toBeNull();
      expect(container.textContent).not.toContain('Drop PDFs here');
      expect(container.textContent).toContain('or drop PDFs here');
    });

    it('renders the starter document before it reads browser storage', async () => {
      // The homepage server-renders this island, and the server has no
      // localStorage. Reading it during the first client render would produce
      // markup the server never emitted, and Preact repairs that mismatch by
      // keeping the server's node and appending its own - which is how
      // duplicate recent tiles shipped once already. Storage may only be read
      // from the mount effect, so the first render must show the starter card
      // even when recent files exist.
      readRecentFiles.mockReturnValue([{
        id: 'sha256:contract', tool: 'sign', fileName: 'contract.pdf', savedAt: Date.now(),
      }]);
      container = document.createElement('div');
      container.setAttribute('data-working-area', '');
      document.body.appendChild(container);
      // Deliberately not wrapped in act(): act flushes effects, and the state
      // under test is the render that happens before they run.
      render(<FileDropzone toolTarget="sign" />, container);

      expect(readRecentFiles).not.toHaveBeenCalled();
      expect(container.querySelector('button[aria-label^="Open bundled sample PDF"]')).not.toBeNull();
      expect(container.textContent).not.toContain('contract.pdf');

      // Flush the mount effect the way the browser would, once the first
      // render has already been committed.
      await act(async () => { render(<FileDropzone toolTarget="sign" />, container); });
      expect(readRecentFiles).toHaveBeenCalled();
      expect(container.textContent).toContain('contract.pdf');
      expect(container.querySelector('button[aria-label^="Open bundled sample PDF"]')).toBeNull();
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

    // MEM-03: opening a recent tile no longer asks anything, whether or not
    // it happens to be the file already open in the target tool - once work
    // lives on the entry rather than a per-tool draft slot, there is nothing
    // a second open could overwrite. Replaces the old "resumes the active
    // draft instead of asking to replace it" test, which existed only to
    // prove the since-removed same-file dialog shortcut.
    // Reopening your own document must restore your work, so a recent tile
    // points the tool at the entry and lets it restore - it does NOT hand the
    // file off. A hand-off means "a file the person just dropped", and
    // useEditorDraftPersistence opens one with empty elements and skips the
    // restore branch entirely, which silently threw the work away (reported
    // 2026-09-20). The end-to-end proof is
    // e2e/home/recent-tile-restores-work.spec.js; this pins the mechanism.
    it('opens a recent file by pointer alone, never through the hand-off that discards work', async () => {
      readRecentFiles.mockReturnValue([{
        id: 'sha256:active', tool: 'sign', fileName: 'contract.pdf', savedAt: Date.now(),
      }]);
      loadRecentFile.mockResolvedValue({
        tool: 'sign', fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes: new ArrayBuffer(8),
      });
      mount();
      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        container.querySelector('button[aria-label^="Open recent PDF"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.querySelector('dialog')).toBeNull();
      expect(setCurrentEntry).toHaveBeenCalledWith('sign', 'sha256:active');
      expect(saveHandoff).not.toHaveBeenCalled();
    });

    // MEM-01 folded Merge's entry into the same recency index every other
    // tool's work lives in, so a saved Merge set is an ordinary row from
    // readRecentFiles() now. Merge reached the pointer-only path first, because
    // a file set plus a page plan cannot go through saveHandoff's single-file
    // contract; every tool takes it now, for the reason above. What stays
    // Merge-specific is that it never needs to read the entry's bytes at all.
    it('opens a saved merge set by pointer alone, without even reading its bytes', async () => {
      readRecentFiles.mockReturnValue([{
        id: 'sha256:merge-set', tool: 'merge', fileName: 'invoice + 2 more', savedAt: Date.now() - 60_000, pageCount: 7,
      }]);
      mount({ toolTarget: 'sign', href: '/sign?action=open' });
      await act(async () => { await Promise.resolve(); });

      const item = container.querySelector('li');
      expect(item.textContent).toContain('invoice + 2 more');
      expect(item.textContent).toContain('7 pages');

      await act(async () => {
        container.querySelector('button[aria-label^="Open recent PDF"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(setCurrentEntry).toHaveBeenCalledWith('merge', 'sha256:merge-set');
      expect(loadRecentFile).not.toHaveBeenCalled();
      expect(saveHandoff).not.toHaveBeenCalled();
    });

    it('draws an empty preview box when a cached file has no preview', () => {
      readRecentFiles.mockReturnValue([{
        id: 'sha256:no-preview', tool: 'sign', fileName: 'pdf1.pdf', savedAt: Date.now(),
      }]);
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

    // MEM-03: dropping a file that would replace what's open in the target
    // tool no longer asks anything - the file it replaces is never gone,
    // only parked in recents, so there is nothing left to confirm. Replaces
    // the three tests that used to cover the "Open this instead?" dialog's
    // ask/cancel/confirm cycle.
    it('hands a dropped file straight to the target tool, with no confirmation', async () => {
      const dropzone = mountTarget();
      await dropOn(dropzone, [pdf()]);

      expect(container.querySelector('dialog')).toBeNull();
      expect(saveHandoff).toHaveBeenCalledTimes(1);
      expect(saveHandoff.mock.calls[0][1].fileName).toBe('contract.pdf');
    });

    it('ignores an empty drop', async () => {
      const dropzone = mountTarget();
      await dropOn(dropzone, []);
      expect(saveHandoff).not.toHaveBeenCalled();
    });

    it('reports an error, and never navigates, if handoff storage fails', async () => {
      saveHandoff.mockResolvedValue(false);
      const area = mountTarget();
      await dropOn(area, [pdf()]);
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
