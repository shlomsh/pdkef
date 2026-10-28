import { describe, expect, it, vi } from 'vitest';
import { planForFile, rotateEntry, withIncludedPages } from '../../../lib/pages/pagePlan.ts';
import { englishToImageMessages } from '../messages';

const { convert } = vi.hoisted(() => ({ convert: vi.fn() }));
vi.mock('./toImage.js', async (importOriginal) => ({ ...(await importOriginal<object>()), convertPdfToImages: convert }));

const { AUTO_BUILD_PAGE_LIMIT, autoBuilds, buildImages, formatName, imageLabels, imagesMade } = await import('./toImageOutput.ts');

const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' });
const image = (pageNumber: number, filename: string) => ({ pageNumber, filename, blob: new Blob(['x'], { type: 'image/png' }) });

describe('imagesMade and autoBuilds', () => {
  it('counts one image per page, or one for the tall image', () => {
    expect(imagesMade(5, 'separate')).toBe(5);
    expect(imagesMade(5, 'concatenated')).toBe(1);
    expect(imagesMade(0, 'concatenated')).toBe(0);
  });

  it('builds in the background up to the page limit and not above it', () => {
    expect(autoBuilds(AUTO_BUILD_PAGE_LIMIT)).toBe(true);
    expect(autoBuilds(AUTO_BUILD_PAGE_LIMIT + 1)).toBe(false);
  });
});

describe('buildImages', () => {
  it('asks for the included pages, each with the plan\'s rotation', async () => {
    convert.mockResolvedValueOnce([image(2, 'report-page-2.png'), image(4, 'report-page-4.png')]);
    const plan = rotateEntry(withIncludedPages(planForFile(0, 5), [2, 4]), '0:3', 90);
    await buildImages(file, plan, { format: 'image/png', scale: 2, layout: 'separate' });
    expect(convert.mock.calls.at(-1)?.[1]).toMatchObject({ format: 'image/png', scale: 2, layout: 'separate', pages: '2, 4', rotations: { 4: 90 } });
  });

  it('several images come back as parts that remember their source page', async () => {
    convert.mockResolvedValueOnce([image(2, 'report-page-2.png'), image(4, 'report-page-4.png')]);
    const built = await buildImages(file, withIncludedPages(planForFile(0, 5), [2, 4]), { format: 'image/png', scale: 1, layout: 'separate' });
    expect(built).toMatchObject({ pageCount: 2, parts: [{ filename: 'report-page-2.png', pageNumber: 2 }, { filename: 'report-page-4.png', pageNumber: 4 }] });
  });

  it('one image comes back as a blob, whether one page or the tall image', async () => {
    convert.mockResolvedValueOnce([image(1, 'report.png')]);
    const built = await buildImages(file, planForFile(0, 3), { format: 'image/png', scale: 1, layout: 'concatenated' });
    expect('blob' in built).toBe(true);
    expect(built.pageCount).toBe(3);
  });
});

describe('formatName and imageLabels', () => {
  it('names the format as people write it', () => {
    expect(formatName('image/jpeg')).toBe('JPG');
    expect(formatName('image/png')).toBe('PNG');
  });

  it('labels Download and Saved by how many images there are', () => {
    expect(imageLabels(1, 'PNG', englishToImageMessages)).toEqual({ downloadLabel: 'Download PNG', savedLabel: 'Saved' });
    expect(imageLabels(7, 'JPG', englishToImageMessages)).toEqual({ downloadLabel: 'Download 7 JPGs', savedLabel: 'Saved 7 JPGs' });
  });
});
