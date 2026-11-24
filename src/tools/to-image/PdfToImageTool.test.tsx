import { describe, expect, it, vi } from 'vitest';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { convertPdfToImages } from './lib/toImage.js';
import { BUILT, pdf, useToImageTool, waitUntil } from './components/toImageTool.test-helper.tsx';

vi.mock('./lib/toImage.js', { spy: true });

describe('PdfToImageTool', () => {
  const s = useToImageTool();
  const conversions = () => vi.mocked(convertPdfToImages).mock.calls.length;
  const lastConversion = () => vi.mocked(convertPdfToImages).mock.lastCall?.[1];

  it('loads the file into the shared grid under a heading that names the images', async () => {
    await s.open();
    expect(s.cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4']);
    expect(s.headingText()).toContain('report-page-N.png');
    expect(s.headingText()).toContain('5 images');
    expect(s.container.querySelector('[data-file-identity]')).toBeNull();
    expect(s.field().value).toBe('1-5');
    expect(s.downloadElement().dataset.state).toBe('ready');
    expect(s.downloadText()).toContain('Download 5 PNGs');
    expect(lastConversion()?.pages).toBe('1-5');
    expect(s.findButton('Convert')).toBeUndefined();
  });

  it('runs the rail in order of consequence, with Replace file last and no hand-offs', async () => {
    await s.open();
    const order = Array.from(s.rail().querySelectorAll('[role="radiogroup"], input, button, a[data-state]'))
      .filter((el) => !el.closest('[role="radiogroup"]') || el.getAttribute('role') === 'radiogroup')
      .map((el) => (el.hasAttribute('data-state') ? 'download' : el.getAttribute('role') || el.id || (el.textContent ?? '').trim()));
    expect(order).toEqual(['radiogroup', 'radiogroup', 'radiogroup', 'page-selector-input', 'Include all', 'Skip all', 'Invert', 'download', 'Replace file']);
    expect(s.findButton('Compress')).toBeUndefined();
    expect(s.findButton('Sign')).toBeUndefined();
  });

  it('gives each option row radiogroup semantics and describes only the selected option', async () => {
    await s.open(2);
    expect(s.rail().querySelectorAll('[role="radiogroup"]').length).toBe(3);
    expect(s.radio('PNG').getAttribute('aria-checked')).toBe('true');
    expect(s.radio('High').getAttribute('aria-checked')).toBe('true');
    expect(s.rail().textContent).toContain('~144 DPI');
    expect(s.rail().textContent).not.toContain('~72 DPI');
    await s.click(s.radio('Standard'));
    expect(s.rail().textContent).toContain('~72 DPI');
    expect(s.rail().textContent).not.toContain('~144 DPI');
  });

  it('skipping a page changes what the Download element says it converts', async () => {
    await s.open();
    await s.click(s.skipButton(2));
    await waitUntil(() => expect(s.downloadText()).toContain('Download 4 PNGs'));
  });

  it('typing a range builds those pages, as one recorded step', async () => {
    await s.open();
    await s.type('2-3');
    await waitUntil(() => expect(lastConversion()?.pages).toBe('2-3'));
    await s.click(s.undo());
    expect(recentActions()).toEqual(['add_files', 'select_pages', 'undo']);
  });

  it('rotating a page is a step and reaches the build as a rotation of that page number', async () => {
    await s.open();
    await s.click(s.container.querySelector<HTMLElement>('[aria-label="Rotate page 2"]') as HTMLElement);
    await waitUntil(() => expect(lastConversion()?.rotations).toEqual({ 2: 90 }));
    expect(recentActions()).toEqual(['add_files', 'rotate']);
    expect(s.undo().disabled).toBe(false);
  });

  it('rebuilds on a format change, and a built format comes back from the cache', async () => {
    await s.open();
    expect(conversions()).toBe(1);
    await s.click(s.radio('JPG'));
    expect(s.downloadText()).toContain('Download 5 JPGs');
    await waitUntil(() => expect(conversions()).toBe(2));
    expect(lastConversion()?.format).toBe('image/jpeg');
    await s.click(s.radio('PNG'));
    expect(s.downloadText()).toContain('Download 5 PNGs');
    expect(s.downloadText()).toMatch(BUILT);
    await s.drain();
    expect(conversions()).toBe(2);
    expect(s.harness.usageEvents('tool_first_edit').map((event) => event.properties.tool)).toEqual(['pdf-to-image']);
  });

  it.each([
    { pages: 31, builds: 0 },
    { pages: 30, builds: 1 },
  ])('with $pages pages it makes $builds builds on its own, and says Made when you tap only above 30', async ({ pages, builds }) => {
    await s.open(pages);
    await s.drain();
    expect(conversions()).toBe(builds);
    expect(s.downloadElement().dataset.state).toBe('ready');
    if (builds === 1) {
      expect(s.downloadText()).not.toContain('Made when you tap');
      return;
    }
    expect(s.downloadText()).toContain('Made when you tap');
    await s.press();
    await waitUntil(() => {
      expect(conversions()).toBe(1);
      expect(s.downloadText()).toMatch(BUILT);
    });
    expect(s.downloadText()).not.toContain('Made when you tap');
  });

  it('a one-page PDF has one Download link and neither the range field nor the bulk row', async () => {
    await s.open(1);
    expect(s.findField()).toBeNull();
    expect(s.findButton('Include all')).toBeUndefined();
    const link = s.downloadElement();
    expect(link.getAttribute('download')).toBe('report.png');
    expect(link.getAttribute('href')).toMatch(/^blob:/);
    expect(link.textContent).toContain('Download PNG');
    expect(s.headingText()).toContain('report.png');
    expect(s.headingText()).toContain('1 image');
  });

  it('One tall image names one file, builds the stacked layout, and counts one image', async () => {
    await s.open(3);
    await s.click(s.radio('One tall image'));
    await waitUntil(() => {
      expect(lastConversion()?.layout).toBe('concatenated');
      expect(s.downloadElement().getAttribute('download')).toBe('report.png');
    });
    expect(s.headingText()).toContain('report.png');
    expect(s.headingText()).toContain('1 image');
    expect(s.downloadText()).toContain('Download PNG');
  });

  it('a replaced file keeps the format, quality and output, and starts a fresh plan and history', async () => {
    await s.open();
    await s.click(s.radio('JPG'));
    await s.click(s.radio('One tall image'));
    await s.click(s.radio('Standard'));
    await s.click(s.skipButton(1));
    await s.replaceWith(await pdf('next.pdf'));
    expect(s.radio('JPG').getAttribute('aria-checked')).toBe('true');
    expect(s.radio('One tall image').getAttribute('aria-checked')).toBe('true');
    expect(s.radio('Standard').getAttribute('aria-checked')).toBe('true');
    expect(s.field().value).toBe('1-5');
    expect(s.undo().disabled).toBe(true);
  });
});
