import { describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { noPagesKey } from '../../test/support/pdfPageTreeFixtures.ts';
import { hebrewSplitMessages } from './messages';
import { hebrewShellMessages } from '#shell/shellMessages.ts';
import { fivePages, pagesOf, pdf, useSplitTool, waitUntil } from './components/splitTool.test-helper.tsx';

describe('PdfSplitTool island', () => {
  const s = useSplitTool();

  const editableName = () => {
    const el = s.container.querySelector<HTMLElement>('[aria-label="File name, editable"]');
    if (!el) throw new Error('Expected the editable file name');
    return el;
  };

  const renameTo = async (name: string) => {
    await act(async () => { editableName().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { editableName().textContent = name; });
    await act(async () => {
      editableName().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
  };

  it('loads the file into the shared grid under a heading that names the output', async () => {
    await s.open();
    expect(s.cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4']);
    expect(s.headingText()).toContain('extracted_open.pdf');
    expect(s.headingText()).toContain('5 pages');
    expect(s.container.querySelector('[data-file-identity]')).toBeNull();
    expect(s.field().value).toBe('1-5');
    expect(s.container.querySelector('label[for="page-selector-input"]')?.textContent).toBe('Pages');
    expect(s.container.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('What to save');
    expect(Array.from(s.container.querySelectorAll('[role="radiogroup"]')[1].querySelectorAll('[role="radio"]')).map((r) => r.textContent))
      .toEqual(['One PDF', 'One PDF per page']);
    expect(s.downloadElement().getAttribute('data-state')).toBe('ready');
    expect(s.downloadText()).toContain('Download 1 PDF');
    expect(s.downloadText()).toContain('5 pages');
    expect((await pagesOf(s.shownOutput())).count).toBe(5);
  });

  it('runs the rail in order of consequence, with Replace file last', async () => {
    await s.open();
    const rail = s.container.querySelector('[data-rail]');
    if (!rail) throw new Error('Expected the rail');
    const order = Array.from(rail.querySelectorAll('[role="radiogroup"], input, button, a[data-state]'))
      .filter((el) => !el.closest('[role="radiogroup"]') || el.getAttribute('role') === 'radiogroup')
      .map((el) => el.getAttribute('role') || el.id || (el.hasAttribute('data-state') ? 'download' : el.textContent?.trim()));
    expect(order.slice(0, 6)).toEqual(['radiogroup', 'page-selector-input', 'Include all', 'Skip all', 'Invert', 'download']);
    expect(order[order.length - 1]).toBe('Replace file');
  });

  it('typing a range skips the other pages, as one Undo step', async () => {
    await s.open();
    await s.type('2-3');
    expect([1, 2, 3, 4, 5].map(s.isSkipped)).toEqual([true, false, false, true, true]);
    expect(s.headingText()).toContain('2 pages');
    await s.click(s.undo());
    expect([1, 2, 3, 4, 5].map(s.isSkipped)).toEqual([false, false, false, false, false]);
    expect(s.field().value).toBe('1-5');
    await s.click(s.redo());
    expect(s.field().value).toBe('2-3');
    expect(recentActions()).toEqual(['add_files', 'select_pages', 'undo', 'redo']);
  });

  it('rotating a page is a step and reaches the build as a rotation of that page number', async () => {
    await s.open();
    const rotate = s.container.querySelector<HTMLElement>('[aria-label="Rotate page 2"]');
    if (!rotate) throw new Error('Expected the rotate button');
    await s.click(rotate);
    await waitUntil(() => {
      expect(s.downloadElement().dataset.state).toBe('ready');
      expect(s.harness.createdBlobs()).toHaveLength(2);
    });
    expect((await pagesOf(s.shownOutput())).rotations).toEqual([0, 90, 0, 0, 0]);
    expect(s.isSkipped(2)).toBe(false);
    expect(recentActions()).toEqual(['add_files', 'rotate']);
    expect(s.undo().disabled).toBe(false);
  });

  it('switching to One PDF per page renames the heading and the Download, and drops the hand-offs', async () => {
    await s.open();
    expect(s.findButton('Compress')).toBeDefined();
    expect(s.findButton('Sign')).toBeDefined();
    await s.click(s.radio('One PDF per page'));
    await waitUntil(() => expect(s.downloadText()).toContain('1 page each'));
    expect(s.headingText()).toContain('open-page-N.pdf');
    expect(s.headingText()).toContain('5 PDFs');
    expect(s.heading()?.querySelector('[contenteditable]')).toBeNull();
    expect(s.container.querySelector('[aria-label="File name, editable"]')).toBeNull();
    expect(s.downloadText()).toContain('Download 5 PDFs');
    expect(s.downloadText()).toContain('1 page each');
    expect(s.findButton('Compress')).toBeUndefined();
    expect(s.findButton('Sign')).toBeUndefined();
    await s.click(s.radio('One PDF'));
    expect(s.headingText()).toContain('extracted_open.pdf');
    expect(s.findButton('Compress')).toBeDefined();
  });

  it('renaming the heading changes the combined file name without a rebuild', async () => {
    await s.open();
    const builds = s.harness.createdBlobs().length;
    expect(editableName().textContent).toBe('extracted_open');
    expect(s.downloadElement().getAttribute('download')).toBe('extracted_open.pdf');
    await renameTo('chapter two');
    await waitUntil(() => expect(s.headingText()).toContain('chapter two.pdf'));
    expect(s.downloadElement().getAttribute('download')).toBe('chapter two.pdf');
    expect(s.harness.createdBlobs()).toHaveLength(builds);
  });

  it('a new file starts over: combined, the source name, a fresh history', async () => {
    await s.open();
    await renameTo('chapter two');
    await waitUntil(() => expect(s.headingText()).toContain('chapter two.pdf'));
    await s.click(s.radio('One PDF per page'));
    await s.click(s.skipButton(1));
    await s.replaceWith(pdf('next.pdf', await fivePages()));
    expect(s.headingText()).toContain('extracted_next.pdf');
    expect(s.radio('One PDF').getAttribute('aria-checked')).toBe('true');
    expect(s.undo().disabled).toBe(true);
    expect(s.field().value).toBe('1-5');
  });

  it('builds from the repaired copy when the page list had to be rebuilt, and keeps the person\'s file for the hand-off', async () => {
    const navigate = vi.fn();
    s.mount({ navigate });
    await s.pick(pdf('broken.pdf', noPagesKey()));
    await waitUntil(() => {
      expect(s.cells()).toHaveLength(3);
      expect(s.downloadElement().dataset.state).toBe('ready');
      expect(s.harness.createdBlobs().length).toBeGreaterThan(0);
    });
    expect((await pagesOf(s.shownOutput())).widths).toEqual([200, 300, 400]);
    await s.click(s.button('Compress'));
    await waitUntil(() => expect(navigate).toHaveBeenCalled());
    const handoff = await s.harness.takeHandoff('compress');
    expect(handoff?.fileName).toBe('extracted_broken.pdf');
    expect((await pagesOf(new Blob([handoff?.fileBytes ?? new Uint8Array()]))).widths).toEqual([200, 300, 400]);
  });

  it('counts skipped pages with the catalogue\'s own plural, in Hebrew too', async () => {
    await s.open({ messages: hebrewSplitMessages, shellMessages: hebrewShellMessages });
    const skipHe = (n: number) => {
      const skip = s.cells()[n - 1].querySelector<HTMLElement>('[aria-label^="דילוג על עמוד"]');
      if (!skip) throw new Error(`Expected the Hebrew skip button at ${n}`);
      return s.click(skip);
    };
    await skipHe(1);
    expect(s.headingText()).toContain('עמוד אחד נסתר');
    await skipHe(2);
    await skipHe(3);
    expect(s.headingText()).toContain('3 עמודים נסתרים');
  });
});
