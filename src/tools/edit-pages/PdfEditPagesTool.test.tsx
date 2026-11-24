import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import Sortable from 'sortablejs';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { healthy } from '../../test/support/pdfPageTreeFixtures.ts';
import { HeldFile } from '../../test/support/heldFile.ts';
import { pdf, useEditPagesTool, waitUntil } from './components/editPagesTool.test-helper.tsx';

describe('PdfEditPagesTool', () => {
  const s = useEditPagesTool();
  afterEach(() => { vi.restoreAllMocks(); });

  const keydown = (init: KeyboardEventInit) => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); });
  const firstEdits = async () => {
    await s.harness.flush();
    return s.harness.usageEvents('tool_first_edit').map((event) => event.properties.tool);
  };

  it.each([
    [undefined, 4, 0],
    ['rotate', 3, 0],
    ['remove', 4, 0],
    ['numbers', 3, 3],
  ] as const)('shows the empty-state verb for its page job (%s)', (job, pages, numbers) => {
    s.mount({ job });
    const stage = s.container.querySelector('[data-dropzone] [aria-hidden="true"]');
    expect(stage?.querySelectorAll('i').length).toBe(pages);
    expect(stage?.querySelectorAll('i > b').length).toBe(numbers);
  });

  it('skipping every page says so on the Download element, not that it is preparing', async () => {
    await s.load();
    await s.click(s.button('Skip all'));
    await waitUntil(() => expect(s.downloadElement().getAttribute('data-state')).toBe('nothing'));
    expect(s.downloadElement().textContent).toContain('Every page is skipped');
    expect(s.downloadElement().textContent).not.toContain('Preparing 0');
  });

  it('loads the PDF into the grid under a heading that names the output, and skipping a page counts in the Download element', async () => {
    await s.load();
    expect(s.cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2']);
    expect(s.heading()).toContain('document_modified.pdf');
    expect(s.heading()).toContain('3 pages');
    expect(s.container.querySelector('[data-file-identity]')).toBeNull();
    expect(s.downloadElement().textContent).toContain('3 pages');
    expect(s.text()).not.toContain('Apply Changes');

    await s.click(s.skipButton(2));
    expect(s.skipped()).toEqual([false, true, false]);
    expect(s.heading()).toContain('2 pages');
    expect(s.heading()).toContain('1 page skipped');
    expect(s.downloadElement().textContent).toContain('2 pages');

    await s.click(s.skipButton(2));
    expect(s.skipped()).toEqual([false, false, false]);
    expect(s.heading()).not.toContain('skipped');
    expect(s.downloadElement().textContent).toContain('3 pages');
  });

  it('shows the loading line while the structure loads, then removes it', async () => {
    const held = new HeldFile(new Uint8Array(healthy()), 'document.pdf');
    s.mount();
    await s.pick(held);
    await held.started;
    expect(s.text()).toContain('Loading PDF file structure');
    held.release();
    await waitUntil(() => expect(s.text()).not.toContain('Loading PDF file structure'));
    await s.settled('document.pdf');
    expect(s.cells()).toHaveLength(3);
  });

  it('runs the rail in order of consequence, with Replace file last', async () => {
    await s.load();
    const rail = s.container.querySelector('[data-rail]');
    const order = Array.from(rail?.querySelectorAll<HTMLElement>('input, button, a[data-state]') ?? [])
      .map((el) => (el.hasAttribute('data-state') ? 'download' : (el as HTMLInputElement).type === 'checkbox' ? 'page numbers' : el.textContent?.trim()));
    expect(order.slice(0, 5)).toEqual(['page numbers', 'Include all', 'Skip all', 'Invert', 'download']);
    expect(order[order.length - 1]).toBe('Replace file');
  });

  it('loading a file is not an edit; an unchanged Include all is not; a rotate is (DEBT-58)', async () => {
    await s.load();
    expect(await firstEdits()).toEqual([]);
    await s.click(s.button('Include all'));
    expect(await firstEdits()).toEqual([]);
    await s.click(s.rotateButton(1));
    expect(await firstEdits()).toEqual(['edit-pdf']);
  });

  it('rotate, skip, undo and redo work from the buttons and the Cmd+Z shortcuts, and the trail records them', async () => {
    await s.load();
    expect(s.undo().disabled).toBe(true);
    expect(s.redo().disabled).toBe(true);

    await s.click(s.rotateButton(1));
    expect(s.rotation(0)).toBe('90');
    expect(s.undo().disabled).toBe(false);
    expect(s.redo().disabled).toBe(true);
    await s.click(s.undo());
    expect(s.rotation(0)).toBe('0');
    expect(s.undo().disabled).toBe(true);
    expect(s.redo().disabled).toBe(false);
    await s.click(s.redo());
    expect(s.rotation(0)).toBe('90');
    expect(s.undo().disabled).toBe(false);
    expect(s.redo().disabled).toBe(true);
    expect(recentActions()).toEqual(['add_files', 'rotate', 'undo', 'redo']);

    await s.click(s.skipButton(2));
    expect(s.skipped()).toEqual([false, true, false]);
    await s.click(s.undo());
    expect(s.skipped()).toEqual([false, false, false]);
    await s.click(s.redo());
    expect(s.skipped()).toEqual([false, true, false]);

    await keydown({ key: 'z', metaKey: true });
    expect(s.skipped()).toEqual([false, false, false]);
    expect(s.rotation(0)).toBe('90');
    await keydown({ key: 'z', metaKey: true });
    expect(s.rotation(0)).toBe('0');
    await keydown({ key: 'z', metaKey: true, shiftKey: true });
    expect(s.rotation(0)).toBe('90');
    await keydown({ key: 'z', metaKey: true, shiftKey: true });
    expect(s.skipped()).toEqual([false, true, false]);
  });

  it('Include all, Skip all and Invert each make one history step, and an unchanged one makes none', async () => {
    await s.load();
    await s.click(s.button('Include all'));
    expect(s.undo().disabled).toBe(true);

    await s.click(s.button('Skip all'));
    expect(s.skipped()).toEqual([true, true, true]);
    expect(s.undo().disabled).toBe(false);
    await s.click(s.button('Skip all'));
    await s.click(s.button('Include all'));
    expect(s.skipped()).toEqual([false, false, false]);
    await s.click(s.undo());
    expect(s.skipped()).toEqual([true, true, true]);
    await s.click(s.button('Invert'));
    expect(s.skipped()).toEqual([false, false, false]);
    await s.click(s.undo());
    expect(s.skipped()).toEqual([true, true, true]);
    await s.click(s.undo());
    expect(s.skipped()).toEqual([false, false, false]);
    expect(s.undo().disabled).toBe(true);
  });

  it('a reorder round-trips through undo and redo, restoring the full page order', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    await s.load(pdf());
    expect(createSpy).toHaveBeenCalledTimes(1);
    const options = createSpy.mock.calls[0][1];
    expect(s.order()).toEqual(['0:0', '0:1', '0:2']);

    await act(async () => { options?.onEnd?.({ oldIndex: 0, newIndex: 2 } as Sortable.SortableEvent); });
    expect(s.order()).toEqual(['0:1', '0:2', '0:0']);
    expect(s.undo().disabled).toBe(false);
    await s.click(s.undo());
    expect(s.order()).toEqual(['0:0', '0:1', '0:2']);
    await s.click(s.redo());
    expect(s.order()).toEqual(['0:1', '0:2', '0:0']);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});
