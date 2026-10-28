// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import FileDropzone, { tileCopy, isolateNames, LAUNCHER_PICK_EVENT } from './FileDropzone.tsx';
import { englishFileDropzoneMessages as en } from './fileDropzoneMessages';
import { consumeRecentOpen } from '../lib/handoff/fileArrival.ts';
import { saveDraft, saveHandoff, setCurrentEntry, readRecentFiles, loadRecentFile } from '../lib/drafts/draftStore.ts';
import { setInputFiles } from '../test/support/setInputFiles.js';

vi.mock('../lib/drafts/draftStore.ts', () => ({
  saveDraft: vi.fn(() => Promise.resolve(true)),
  saveHandoff: vi.fn(() => Promise.resolve(true)),
  setCurrentEntry: vi.fn(),
  readRecentFiles: vi.fn(() => []),
  loadRecentFile: vi.fn(() => Promise.resolve(null)),
  MAX_RECENT_FILES: 6,
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
    // SITE-42: several files, PDFs and JPEG/PNG photos, routed by routeFiles.
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png');
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
      expect(container.textContent).toContain('or drop them here, then pick a tool below');
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
      // DEBT-58: the tool page reads this to call its restore a recent open, not a restore.
      expect(consumeRecentOpen('sign')).toBe(true);
      expect(saveHandoff).not.toHaveBeenCalled();
      // And it never reads the entry, which is the difference between a tile
      // that opens and one that hangs: the record carries the whole PDF, and
      // awaiting it on a phone left the tile stuck on "Opening..." with
      // nothing happening (reported 2026-09-20, shipped by the fix above).
      // `recent.tool` is already on the index row the tile was rendered from.
      expect(loadRecentFile).not.toHaveBeenCalled();
    });

    it('opens without waiting on the store, so a slow or blocked read cannot strand the tile', async () => {
      readRecentFiles.mockReturnValue([{
        id: 'sha256:slow', tool: 'redact', fileName: 'scan.pdf', savedAt: Date.now(),
      }]);
      // A store that never answers. If opening a tile awaited it at all, the
      // pointer below would never be set and the dropzone would sit busy.
      loadRecentFile.mockReturnValue(new Promise(() => {}));
      mount();
      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        container.querySelector('button[aria-label^="Open recent PDF"]').click();
      });

      expect(setCurrentEntry).toHaveBeenCalledWith('redact', 'sha256:slow');
      expect(loadRecentFile).not.toHaveBeenCalled();
    });

    // The wiring half of useNavigatingAway.ts: jsdom cannot restore a frozen
    // page, so this pins that a restore re-enables every control `busy`
    // disables. The restore itself is e2e/home/back-navigation.spec.js.
    it('reopens after a restore, so the next document still opens', async () => {
      const savedAt = Date.now();
      readRecentFiles.mockReturnValue([
        { id: 'sha256:first', tool: 'sign', fileName: 'first.pdf', savedAt },
        { id: 'sha256:second', tool: 'sign', fileName: 'second.pdf', savedAt },
      ]);
      mount();
      await act(async () => { await Promise.resolve(); });
      const tiles = () => Array.from(container.querySelectorAll('button[aria-label^="Open recent PDF"]'));

      await act(async () => { tiles()[0].click(); });
      expect(setCurrentEntry).toHaveBeenLastCalledWith('sign', 'sha256:first');
      expect(tiles()[1].disabled).toBe(true);
      expect(container.querySelector('[data-home-picker]').textContent).toContain('Opening');

      await act(async () => {
        const restore = new Event('pageshow');
        restore.persisted = true;
        window.dispatchEvent(restore);
      });

      expect(tiles()[1].disabled).toBe(false);
      expect(container.querySelector('[data-home-picker]').textContent).not.toContain('Opening');
      await act(async () => { tiles()[1].click(); });
      expect(setCurrentEntry).toHaveBeenLastCalledWith('sign', 'sha256:second');
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

    // SITE-42: one PDF no longer goes straight to toolTarget; it waits for a
    // click on a lit toolbar link, so these tests give it a one-link dock and
    // make that click. The hand-off record and failure handling are unchanged.
    let hero;
    beforeEach(() => {
      hero = document.createElement('div');
      hero.className = 'home-hero';
      hero.innerHTML = '<nav class="home-dock"><a class="app-card" data-tool="sign" href="/sign/"><div class="app-label">Sign PDF</div></a></nav>';
      hero.querySelector('.home-dock').scrollTo = vi.fn();
      document.body.appendChild(hero);
    });
    afterEach(() => hero.remove());
    const chooseSign = () => act(async () => {
      hero.querySelector('a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    function mountTarget() {
      mount({ toolTarget: 'sign', href: '/sign?action=open' });
      return container;
    }

    it('parks the file in a handoff, never in the tool\'s draft', async () => {
      const dropzone = mountTarget();
      await dropOn(dropzone, [pdf()]);
      await chooseSign();

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
      await chooseSign();

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
      await chooseSign();

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
      await chooseSign();
      expect(container.querySelector('[data-home-picker] [data-tone="note"]')?.textContent).toContain('could not save this file');
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    // SITE-42: used to assert the "use Merge PDF below" error; several PDFs
    // now go straight to Merge (see the routing describe below).
    it('sends several dropped PDFs to Merge instead of refusing them', async () => {
      const area = mountTarget();
      await dropOn(area, [pdf(), pdf()]);
      expect(saveHandoff).toHaveBeenCalledTimes(1);
      expect(saveHandoff.mock.calls[0][0]).toBe('merge');
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });

  });

  describe('tileCopy', () => {
    const noteFile = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    it('a note replaces the line in every state and leaves the title alone', () => {
      const note = 'Left out: a.txt';
      expect(tileCopy({ choice: null, opening: null, busy: false, note }, en))
        .toEqual({ title: 'Choose files', line: note, tone: 'note', choosing: false });
      expect(tileCopy({ choice: null, opening: null, busy: true, note }, en))
        .toEqual({ title: 'Opening…', line: note, tone: 'note', choosing: false });
      expect(tileCopy({ choice: { files: [noteFile], tools: ['sign'] }, opening: null, busy: false, note }, en))
        .toEqual({ title: 'a.pdf', line: note, tone: 'note', choosing: true });
      expect(tileCopy({ choice: null, opening: { title: 'a.pdf', tool: 'Sign PDF' }, busy: true, note }, en))
        .toEqual({ title: 'a.pdf', line: note, tone: 'note', choosing: false });
    });
    it('an empty note changes nothing', () => {
      expect(tileCopy({ choice: null, opening: null, busy: false, note: '' }, en))
        .toEqual({ title: 'Choose files', line: en.orDropThenPick, tone: 'plain', choosing: false });
    });
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    it('rest, busy, choosing and opening each get their own title and line', () => {
      expect(tileCopy({ choice: null, opening: null, busy: false }, en)).toEqual({ title: 'Choose files', line: en.orDropThenPick, tone: 'plain', choosing: false });
      expect(tileCopy({ choice: null, opening: null, busy: true }, en)).toMatchObject({ title: 'Opening…', choosing: false });
      expect(tileCopy({ choice: { files: [file], tools: ['sign'] }, opening: null, busy: false }, en))
        .toEqual({ title: 'a.pdf', line: 'Now pick a tool below', tone: 'plain', choosing: true });
      expect(tileCopy({ choice: null, opening: { title: '3 files', tool: 'Merge PDF' }, busy: true }, en))
        .toEqual({ title: '3 files', line: 'Opening Merge PDF…', tone: 'plain', choosing: false });
      expect(tileCopy({ choice: null, opening: { title: 'a.pdf', tool: 'Sign PDF' }, busy: true }, en))
        .toEqual({ title: 'a.pdf', line: 'Opening Sign PDF…', tone: 'plain', choosing: false });
    });
  });

  describe('routing picked files (SITE-42)', () => {
    const LABELS = {
      redact: 'Redact PDF', sign: 'Sign PDF', merge: 'Merge PDF', 'image-to-pdf': 'Image to PDF', 'pdf-to-image': 'PDF to Image',
      split: 'Split PDF', compress: 'Compress PDF', 'compress-image': 'Compress Image', unlock: 'Unlock PDF', 'organize-pdf': 'Edit PDF Pages',
    };
    const pdf = (name = 'a.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });
    const photo = (name = 'p.jpg') => new File(['jpg'], name, { type: 'image/jpeg' });
    let hero, dock, back, realLocation, scrollIntoView;
    const link = (tool) => dock.querySelector(`[data-tool="${tool}"]`);
    const picker = () => container.querySelector('[data-home-picker]');
    const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const pick = async (files, root = container) => {
      await act(async () => {
        setInputFiles(root.querySelector('input[type="file"]'), files);
        await new Promise((r) => setTimeout(r, 0));
      });
    };
    const lit = () => [...dock.querySelectorAll('[data-fits]')].map((a) => a.dataset.tool);

    beforeEach(() => {
      hero = document.createElement('div');
      hero.className = 'home-hero';
      hero.innerHTML = '<nav class="home-dock">' + Object.entries(LABELS).map(([t, l]) =>
        `<a class="app-card" data-tool="${t}" href="/${t}/"><div class="app-label">${l}</div></a>`).join('') + '</nav>';
      document.body.appendChild(hero);
      dock = hero.querySelector('.home-dock');
      dock.scrollTo = vi.fn();
      back = document.createElement('a');
      back.setAttribute('data-workspace-return', '');
      back.href = '#home-tour';
      back.addEventListener('click', (e) => e.preventDefault());
      document.body.appendChild(back);
      realLocation = Object.getOwnPropertyDescriptor(window, 'location');
      Object.defineProperty(window, 'location', { configurable: true, value: { href: '/', search: '' } });
      scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(() => {
      hero.remove();
      back.remove();
      Object.defineProperty(window, 'location', realLocation);
      delete Element.prototype.scrollIntoView;
    });

    it('opens Merge for several PDFs, lighting it on the way', async () => {
      mount();
      await pick([pdf('a.pdf'), pdf('b.pdf')]);
      expect(saveHandoff).toHaveBeenCalledTimes(1);
      const [key, record] = saveHandoff.mock.calls[0];
      expect(key).toBe('merge');
      expect(record.files.map((f) => f.fileName)).toEqual(['a.pdf', 'b.pdf']);
      expect(record.files[0].fileType).toBe('application/pdf');
      expect(record.files[0].fileBytes.byteLength).toBeGreaterThan(0);
      expect(window.location.href).toBe('/merge/');
      expect(hero.hasAttribute('data-picking')).toBe(true);
      expect(lit()).toEqual(['merge']);
      expect(picker().textContent).toContain('2 files');
      expect(picker().textContent).toContain('Opening Merge PDF…');
    });

    it('opens Image to PDF for several photos, naming types from extensions when the browser gives none', async () => {
      mount();
      await pick([new File(['x'], 'one.JPG'), new File(['y'], 'two.png')]);
      const [key, record] = saveHandoff.mock.calls[0];
      expect(key).toBe('image-to-pdf');
      expect(record.files.map((f) => f.fileType)).toEqual(['image/jpeg', 'image/png']);
      expect(window.location.href).toBe('/image-to-pdf/');
    });

    it('keeps the fill-mode param on the way out', async () => {
      window.location.search = '?next=0';
      mount();
      await pick([pdf(), pdf('b.pdf')]);
      expect(window.location.href).toBe('/merge/?next=0');
    });

    it('waits for a choice on one PDF: attributes, name, prompt, focus on the first lit link in dock order', async () => {
      mount();
      await pick([pdf('contract.pdf')]);
      expect(saveHandoff).not.toHaveBeenCalled();
      expect(hero.hasAttribute('data-picking')).toBe(true);
      expect(picker().hasAttribute('data-picking')).toBe(true);
      expect(lit()).toEqual(['redact', 'sign', 'merge', 'pdf-to-image', 'split', 'compress', 'unlock', 'organize-pdf']);
      expect(picker().textContent).toContain('contract.pdf');
      expect(picker().textContent).toContain('Change');
      expect(picker().textContent).toContain('Now pick a tool below');
      expect(container.querySelector('[aria-live="polite"]').textContent).toBe('Now pick a tool below');
      expect(document.activeElement).toBe(link('redact'));
      expect(dock.scrollTo).toHaveBeenCalledTimes(1);
      expect(dock.scrollTo.mock.calls[0][0]).toMatchObject({ left: expect.any(Number) });
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    // The dock's edge fades are 40px wide at either end: the first lit tool
    // lands clear of the start fade, and on an RTL page the start is the right.
    it.each([
      ['ltr', { left: 300, right: 380 }, -56 + 300],
      ['rtl', { left: 20, right: 100 }, 100 - 375 + 56],
    ])('scrolls the first lit tool clear of the start edge fade (%s)', async (direction, rect, expected) => {
      dock.style.direction = direction;
      dock.getBoundingClientRect = () => ({ left: 0, right: 375 }) as DOMRect;
      link('image-to-pdf').getBoundingClientRect = () => rect as DOMRect;
      mount();
      await pick([new File(['x'], 'photo.jpg', { type: 'image/jpeg' })]);
      expect(dock.scrollTo.mock.calls[0][0].left).toBe(expected);
    });

    // Merge takes photos too, but only alongside a PDF does the toolbar offer it (MERGE-22).
    it('lights the two image tools for one photo, not Merge', async () => {
      mount();
      await pick([photo()]);
      expect(lit()).toEqual(['image-to-pdf', 'compress-image']);
      expect(document.activeElement).toBe(link('image-to-pdf'));
    });

    it('hands the file to the clicked lit tool, Compress Image under the compress key', async () => {
      mount();
      await pick([photo('p.jpg')]);
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      await act(async () => { link('compress-image').dispatchEvent(click); await new Promise((r) => setTimeout(r, 0)); });
      expect(click.defaultPrevented).toBe(true);
      const [key, record] = saveHandoff.mock.calls[0];
      expect(key).toBe('compress');
      expect(record.fileName).toBe('p.jpg');
      expect(record.fileType).toBe('image/jpeg');
      expect(window.location.href).toBe('/compress-image/');
    });

    it('leaves a dimmed link a plain link', async () => {
      mount();
      await pick([pdf()]);
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      await act(async () => { link('image-to-pdf').dispatchEvent(click); await flush(); });
      expect(click.defaultPrevented).toBe(false);
      expect(saveHandoff).not.toHaveBeenCalled();
      expect(window.location.href).toBe('/');
    });

    const expectRest = () => {
      expect(hero.hasAttribute('data-picking')).toBe(false);
      expect(picker().hasAttribute('data-picking')).toBe(false);
      expect(lit()).toEqual([]);
      expect(picker().textContent).toContain('Choose files');
      expect(container.querySelector('[aria-live="polite"]').textContent).toBe('');
    };

    it('returns to rest on Escape, and stops listening for it and for dock clicks', async () => {
      mount();
      await pick([pdf()]);
      await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expectRest();
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      await act(async () => { link('sign').dispatchEvent(click); await flush(); });
      expect(click.defaultPrevented).toBe(false);
      expect(saveHandoff).not.toHaveBeenCalled();
    });

    it('returns to rest on a tile click and opens the picker again', async () => {
      mount();
      await pick([pdf()]);
      const open = vi.spyOn(container.querySelector('input[type="file"]'), 'click');
      await act(async () => { picker().click(); });
      expectRest();
      expect(open).toHaveBeenCalled();
    });

    it('returns to rest when the page comes back from the back/forward cache', async () => {
      mount();
      await pick([pdf(), pdf('b.pdf')]);
      expect(picker().disabled).toBe(true);
      await act(async () => { const e = new Event('pageshow'); e.persisted = true; window.dispatchEvent(e); });
      expectRest();
      expect(picker().disabled).toBe(false);
    });

    it('opens Merge for PDFs and photos together, one multi record in pick order', async () => {
      mount();
      await pick([photo('p.jpg'), pdf('a.pdf')]);
      expect(saveHandoff).toHaveBeenCalledTimes(1);
      const [key, record] = saveHandoff.mock.calls[0];
      expect(key).toBe('merge');
      expect(record.files.map((f) => f.fileName)).toEqual(['p.jpg', 'a.pdf']);
      expect(record.files.map((f) => f.fileType)).toEqual(['image/jpeg', 'application/pdf']);
      expect(window.location.href).toBe('/merge/');
      expect(lit()).toEqual(['merge']);
    });

    it('says what it takes when nothing is usable, and opens nothing', async () => {
      mount();
      await pick([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
      expect(container.querySelector('[data-home-picker] [data-tone="note"]').textContent).toBe('Choose PDFs, or JPEG and PNG photos.');
      expect(saveHandoff).not.toHaveBeenCalled();
      expect(lit()).toEqual([]);
    });

    it('names what it left out alongside the routed outcome', async () => {
      mount();
      await pick([pdf(), new File(['x'], 'a.txt', { type: 'text/plain' }), new File(['x'], 'b.docx')]);
      expect(container.querySelector('[data-home-picker] [data-tone="note"]').textContent).toBe(`Left out: ${isolateNames([{ name: 'a.txt' }, { name: 'b.docx' }])}`);
      expect(container.querySelector('[aria-live="polite"]').textContent).toContain('Left out:');
      expect(container.querySelector('[aria-live="assertive"]').textContent).toBe('');
      expect(lit()).toHaveLength(8);
    });

    it('still opens the practice document in Sign directly', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['%PDF'])) })));
      mount();
      await act(async () => { await Promise.resolve(); });
      await act(async () => {
        container.querySelector('button[aria-label^="Open bundled sample PDF"]').click();
        await new Promise((r) => setTimeout(r, 10));
      });
      vi.unstubAllGlobals();
      expect(saveHandoff.mock.calls[0][0]).toBe('sign');
      expect(saveHandoff.mock.calls[0][1].fileName).toBe('PDkef practice form.pdf');
      expect(window.location.href).toBe('/sign/');
      expect(lit()).toEqual([]);
    });

    it('closing launcher: several files open directly', async () => {
      mount({ final: true });
      await pick([pdf(), photo('q.png')]);
      expect(saveHandoff.mock.calls[0][0]).toBe('merge');
      expect(window.location.href).toBe('/merge/');
    });

    it('closing launcher: one file clicks the return link and tells the first screen, waking nothing itself', async () => {
      const clicked = vi.fn();
      back.addEventListener('click', clicked);
      const heard = vi.fn();
      window.addEventListener(LAUNCHER_PICK_EVENT, heard);
      mount({ final: true });
      const f = pdf('far.pdf');
      await pick([f]);
      window.removeEventListener(LAUNCHER_PICK_EVENT, heard);
      expect(clicked).toHaveBeenCalledTimes(1);
      expect(heard).toHaveBeenCalledTimes(1);
      expect(heard.mock.calls[0][0].detail.files.map((x) => x.name)).toEqual(['far.pdf']);
      expect(LAUNCHER_PICK_EVENT).toBe('pdkef:launcher-pick');
      expect(saveHandoff).not.toHaveBeenCalled();
      expect(lit()).toEqual([]);
      expect(hero.hasAttribute('data-picking')).toBe(false);
    });

    it('the first-screen launcher enters the waiting state on that event', async () => {
      mount();
      await act(async () => {
        window.dispatchEvent(new CustomEvent(LAUNCHER_PICK_EVENT, { detail: { files: [pdf('far.pdf')] } }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(picker().textContent).toContain('far.pdf');
      expect(lit()).toHaveLength(8);
      expect(document.activeElement).toBe(link('redact'));
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    describe('review findings', () => {
      const ARROW = 'svg[viewBox="0 0 40 72"]';
      const clickLink = (tool, init = {}) => {
        const click = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
        return act(async () => { link(tool).dispatchEvent(click); await flush(); }).then(() => click);
      };

      it('draws the tile arrow on the first screen only, not in the closing launcher', () => {
        mount();
        expect(picker().querySelector(ARROW)).not.toBeNull();
        act(() => render(null, container));
        mount({ final: true });
        expect(picker().querySelector(ARROW)).toBeNull();
      });

      // Real Mobile Safari never runs a second, later draw-on animation on the head
      // path (only its round cap shows, as a dot), so shaft and head are one path
      // drawn in one stroke; the same drawing, revealed shaft first, then head.
      it('draws the arrow as one stroke, shaft then head', () => {
        mount();
        const paths = picker().querySelectorAll(`${ARROW} path`);
        expect(paths).toHaveLength(1);
        expect(paths[0].getAttribute('d')).toMatch(/^M36 6C.*16 67M7 61L15\.8 67\.6L19 56\.5$/);
        expect(paths[0].getAttribute('pathLength')).toBe('1');
      });

      it('keeps waiting, lit and retryable when the hand-off of a clicked tool fails', async () => {
        mount();
        await pick([pdf('contract.pdf')]);
        saveHandoff.mockResolvedValueOnce(false);
        await clickLink('sign');
        expect(hero.hasAttribute('data-picking')).toBe(true);
        expect(lit()).toHaveLength(8);
        expect(container.querySelector('[data-home-picker] [data-tone="note"]').textContent).toBe(en.handoffFailed);
        expect(picker().disabled).toBe(false);
        expect(picker().textContent).toContain('contract.pdf');
        expect(picker().textContent).toContain(en.handoffFailed);
        await clickLink('sign');
        expect(saveHandoff).toHaveBeenCalledTimes(2);
        expect(window.location.href).toBe('/sign/');
      });

      it('rests the dock and the tile when the hand-off of several files fails', async () => {
        mount();
        saveHandoff.mockResolvedValueOnce(false);
        await pick([pdf('a.pdf'), pdf('b.pdf')]);
        expect(hero.hasAttribute('data-picking')).toBe(false);
        expect(lit()).toEqual([]);
        expect(picker().disabled).toBe(false);
        expect(picker().textContent).toContain('Choose files');
      });

      it('hands off the bytes read at pick time, even when the picked file stops being readable while it waits', async () => {
        mount();
        const f = pdf('contract.pdf');
        const read = f.arrayBuffer.bind(f);
        let readable = true;
        f.arrayBuffer = () => (readable ? read() : Promise.reject(new DOMException('gone', 'NotReadableError')));
        await pick([f]);
        readable = false;
        expect(lit()).toHaveLength(8);
        await clickLink('sign');
        expect(saveHandoff).toHaveBeenCalledTimes(1);
        const [key, record] = saveHandoff.mock.calls[0];
        expect(key).toBe('sign');
        expect(record.fileName).toBe('contract.pdf');
        expect(new TextDecoder().decode(record.fileBytes)).toBe('%PDF');
        expect(window.location.href).toBe('/sign/');
      });

      it('names a picked file that cannot be read, and lights nothing', async () => {
        mount();
        const f = pdf('contract.pdf');
        f.arrayBuffer = () => Promise.reject(new DOMException('gone', 'NotReadableError'));
        await pick([f]);
        expect(container.querySelector('[data-home-picker] [data-tone="note"]').textContent).toBe(`Left out: ${isolateNames([f])}`);
        expect(hero.hasAttribute('data-picking')).toBe(false);
        expect(lit()).toEqual([]);
        expect(picker().textContent).toContain('Choose files');
      });

      it('hands off once when a second lit tool is clicked while the first is in flight', async () => {
        mount();
        await pick([pdf()]);
        saveHandoff.mockReturnValue(new Promise(() => {}));
        await clickLink('sign');
        await clickLink('merge');
        expect(saveHandoff).toHaveBeenCalledTimes(1);
      });

      it('tells the person which tool is opening, with the file name, after a click', async () => {
        mount();
        await pick([pdf('contract.pdf')]);
        saveHandoff.mockReturnValue(new Promise(() => {}));
        await clickLink('sign');
        expect(picker().textContent).toContain('contract.pdf');
        expect(picker().textContent).toContain('Opening Sign PDF…');
        expect(picker().textContent).not.toContain('Change');
        expect(picker().textContent).not.toContain('1 files');
      });

      it('clears an earlier error when the closing launcher passes one file up', async () => {
        mount({ final: true });
        await pick([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
        expect(container.querySelector('[data-tone="note"]')).not.toBeNull();
        await pick([pdf('far.pdf')]);
        expect(container.querySelector('[data-tone="note"]')).toBeNull();
      });

      const restore = () => act(async () => { const e = new Event('pageshow'); e.persisted = true; window.dispatchEvent(e); });
      const txt = (name = 'a.txt') => new File(['x'], name, { type: 'text/plain' });
      const noteOf = () => container.querySelector('[data-home-picker] [data-tone="note"]');
      const unreadable = (name) => { const f = pdf(name); f.arrayBuffer = () => Promise.reject(new DOMException('gone', 'NotReadableError')); return f; };
      const escape = (init = {}) => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init })); });

      it('lets a lit tool open again after a restore from the back/forward cache', async () => {
        mount();
        await pick([pdf('a.pdf')]);
        await clickLink('sign');
        expect(saveHandoff).toHaveBeenCalledTimes(1);
        await restore();
        await pick([pdf('b.pdf')]);
        await clickLink('sign');
        expect(saveHandoff).toHaveBeenCalledTimes(2);
      });

      it('styles the note with a selector at least as specific as `.tile span`', () => {
        const css = readFileSync('src/site-lib/FileDropzone.module.css', 'utf8');
        expect(css).toMatch(/\.tile\s+\.note\s*\{[^}]*var\(--color-danger\)/);
      });

      it('clears the note on Escape, on the tile click, and on a restore', async () => {
        mount();
        await pick([pdf(), txt()]);
        expect(noteOf()).not.toBeNull();
        await escape();
        expect(noteOf()).toBeNull();
        await pick([pdf(), txt()]);
        await act(async () => { picker().click(); });
        expect(noteOf()).toBeNull();
        await pick([pdf('a.pdf'), pdf('b.pdf'), txt()]);
        expect(noteOf()).not.toBeNull();
        await restore();
        expect(noteOf()).toBeNull();
      });

      it('speaks failures assertively and the left-out list with the prompt politely', async () => {
        mount();
        const polite = () => container.querySelector('[aria-live="polite"]').textContent;
        const assertive = () => container.querySelector('[aria-live="assertive"]').textContent;
        expect(assertive()).toBe('');
        await pick([pdf('c.pdf'), txt()]);
        expect(polite()).toBe(`Left out: ${isolateNames([txt()])}. Now pick a tool below`);
        expect(assertive()).toBe('');
        saveHandoff.mockResolvedValueOnce(false);
        await clickLink('sign');
        expect(assertive()).toBe(en.handoffFailed);
        expect(polite()).toBe('Now pick a tool below');
      });

      it('closing launcher: rests on "or drop them here", sets no note on a choice, and passes the left-out files up', async () => {
        const heard = vi.fn();
        window.addEventListener(LAUNCHER_PICK_EVENT, heard);
        mount({ final: true });
        expect(picker().textContent).toContain('or drop them here');
        expect(picker().textContent).not.toContain('pick a tool below');
        await pick([pdf('far.pdf'), txt('b.txt')]);
        window.removeEventListener(LAUNCHER_PICK_EVENT, heard);
        expect(noteOf()).toBeNull();
        expect(heard.mock.calls[0][0].detail.skipped.map((x) => x.name)).toEqual(['b.txt']);
      });

      it('closing launcher: sends read copies, and the first screen does not read them again', async () => {
        const heard = vi.fn();
        window.addEventListener(LAUNCHER_PICK_EVENT, heard);
        mount({ final: true });
        const f = pdf('far.pdf');
        await pick([f]);
        window.removeEventListener(LAUNCHER_PICK_EVENT, heard);
        const sent = heard.mock.calls[0][0].detail.files[0];
        expect(sent).not.toBe(f);
        expect(new TextDecoder().decode(await sent.arrayBuffer())).toBe('%PDF');
        act(() => render(null, container));
        mount();
        const gone = pdf('far.pdf');
        gone.arrayBuffer = () => Promise.reject(new Error('gone'));
        await act(async () => { window.dispatchEvent(new CustomEvent(LAUNCHER_PICK_EVENT, { detail: { files: [gone], skipped: [] } })); await flush(); });
        expect(lit()).toHaveLength(8);
      });

      it('ends the wait when several files open instead, so a failed hand-off does not say "pick a tool"', async () => {
        mount();
        await pick([pdf('one.pdf')]);
        saveHandoff.mockResolvedValueOnce(false);
        await pick([pdf('a.pdf'), pdf('b.pdf')]);
        expect(picker().textContent).not.toContain('Now pick a tool below');
        expect(picker().textContent).toContain('Choose files');
        expect(lit()).toEqual([]);
      });

      it('shows the busy tile while the bytes are read', async () => {
        mount();
        let finish;
        const slow = pdf('slow.pdf');
        slow.arrayBuffer = () => new Promise((r) => { finish = () => r(new ArrayBuffer(4)); });
        await pick([slow]);
        expect(picker().textContent).toContain('Opening…');
        await act(async () => { finish(); await flush(); });
        expect(picker().textContent).toContain('slow.pdf');
        expect(picker().textContent).not.toContain('Opening…');
      });

      it('lets a newer pick win over a slower, older read', async () => {
        mount();
        let finish;
        const slow = pdf('old.pdf');
        slow.arrayBuffer = () => new Promise((r) => { finish = () => r(new ArrayBuffer(4)); });
        await pick([slow]);
        await pick([pdf('new.pdf')]);
        await act(async () => { finish(); await flush(); });
        expect(picker().textContent).toContain('new.pdf');
        expect(picker().textContent).not.toContain('old.pdf');
      });

      it('routes the readable files again and names the unreadable ones', async () => {
        mount();
        await pick([pdf('good.pdf'), unreadable('bad.pdf')]);
        expect(lit()).toHaveLength(8);
        expect(picker().textContent).toContain('good.pdf');
        expect(noteOf().textContent).toBe(`Left out: ${isolateNames([{ name: 'bad.pdf' }])}`);
        await pick([pdf('g1.pdf'), pdf('g2.pdf'), unreadable('bad.pdf')]);
        expect(saveHandoff.mock.calls[0][0]).toBe('merge');
        expect(saveHandoff.mock.calls[0][1].files.map((f) => f.fileName)).toEqual(['g1.pdf', 'g2.pdf']);
      });

      it('shows only the left-out note when nothing can be read', async () => {
        mount();
        await pick([unreadable('a.pdf'), unreadable('b.pdf')]);
        expect(noteOf().textContent).toBe(`Left out: ${isolateNames([{ name: 'a.pdf' }, { name: 'b.pdf' }])}`);
        expect(noteOf().textContent).not.toContain(en.handoffFailed);
        expect(lit()).toEqual([]);
        expect(saveHandoff).not.toHaveBeenCalled();
      });

      it('ignores an Escape someone already handled, or one pressed inside an open dialog', async () => {
        mount();
        await pick([pdf()]);
        const stop = (e) => e.preventDefault();
        window.addEventListener('keydown', stop, true);
        await escape();
        window.removeEventListener('keydown', stop, true);
        expect(lit()).toHaveLength(8);
        const dialog = document.createElement('dialog');
        dialog.setAttribute('open', '');
        dialog.innerHTML = '<button>ok</button>';
        document.body.appendChild(dialog);
        dialog.querySelector('button').focus();
        await escape();
        dialog.remove();
        expect(lit()).toHaveLength(8);
      });

      it('moves focus back to the tile after Escape', async () => {
        mount();
        await pick([pdf()]);
        expect(document.activeElement).toBe(link('redact'));
        await escape();
        expect(document.activeElement).toBe(picker());
      });

      it('isolates each name for bidi so mixed Hebrew and Latin names keep their order', () => {
        expect(isolateNames([{ name: 'a.txt' }, { name: 'דוח.docx' }])).toBe('⁨a.txt⁩, ⁨דוח.docx⁩');
        expect(isolateNames([])).toBe('');
      });

      it.each([['ctrl', { ctrlKey: true }], ['meta', { metaKey: true }], ['shift', { shiftKey: true }], ['alt', { altKey: true }], ['middle button', { button: 1 }]])(
        'leaves a %s-click on a lit tool to the browser', async (_, init) => {
          mount();
          await pick([pdf()]);
          const click = await clickLink('sign', init);
          expect(click.defaultPrevented).toBe(false);
          expect(saveHandoff).not.toHaveBeenCalled();
        });
    });
  });
});
