import { describe, expect, it } from 'vitest';
import { tools } from '../data/tools.js';
import { IMAGE_TOOLS, PDF_TOOLS, handoffKeyFor, routeFiles } from './routeFiles';

const f = (name: string, type = '') => new File(['x'], name, { type });
const names = (files: File[]) => files.map((x) => x.name);

describe('routeFiles', () => {
  it.each([
    ['empty list', [], 'none', 'unsupported', [], []],
    ['one pdf', [f('a.pdf', 'application/pdf')], 'choose', [...PDF_TOOLS], ['a.pdf'], []],
    ['one pdf, empty type, .PDF name', [f('A.PDF')], 'choose', [...PDF_TOOLS], ['A.PDF'], []],
    ['one pdf plus skipped', [f('n.txt', 'text/plain'), f('a.pdf'), f('p.heic')], 'choose', [...PDF_TOOLS], ['a.pdf'], ['n.txt', 'p.heic']],
    ['two pdfs keep order', [f('b.pdf'), f('a.PDF', 'application/pdf')], 'open', 'merge', ['b.pdf', 'a.PDF'], []],
    ['two pdfs plus skipped', [f('x.txt'), f('b.pdf'), f('y.heic'), f('a.pdf')], 'open', 'merge', ['b.pdf', 'a.pdf'], ['x.txt', 'y.heic']],
    ['one photo by type', [f('p', 'image/png')], 'choose', [...IMAGE_TOOLS], ['p'], []],
    ['one photo uppercase ext', [f('P.JPEG')], 'choose', [...IMAGE_TOOLS], ['P.JPEG'], []],
    ['one photo plus skipped', [f('p.jpg'), f('n.txt')], 'choose', [...IMAGE_TOOLS], ['p.jpg'], ['n.txt']],
    ['two photos keep order', [f('z.PNG'), f('a.jpg', 'image/jpeg')], 'open', 'image-to-pdf', ['z.PNG', 'a.jpg'], []],
    ['two photos plus skipped', [f('s.heic'), f('z.png'), f('a.JPG')], 'open', 'image-to-pdf', ['z.png', 'a.JPG'], ['s.heic']],
    ['pdf and photo', [f('a.pdf'), f('p.jpg'), f('n.txt')], 'none', 'mixed', [], ['n.txt']],
    ['only unsupported', [f('n.txt'), f('p.heic')], 'none', 'unsupported', [], ['n.txt', 'p.heic']],
  ] as const)('%s', (_label, input, kind, what, files, skipped) => {
    const r = routeFiles(input);
    expect(r.kind).toBe(kind);
    if (r.kind === 'open') expect(r.tool).toBe(what);
    if (r.kind === 'choose') expect(r.tools).toEqual(what);
    if (r.kind === 'none') expect(r.reason).toBe(what);
    if (r.kind !== 'none') expect(names(r.files)).toEqual(files);
    expect(names(r.skipped)).toEqual(skipped);
  });

  it('covers exactly the slugs in the tool registry', () => {
    expect(new Set([...PDF_TOOLS, ...IMAGE_TOOLS])).toEqual(new Set(tools.map((t: { slug: string }) => t.slug)));
  });
});

describe('handoffKeyFor', () => {
  it('maps compress-image to compress and leaves other slugs alone', () => {
    expect(handoffKeyFor('compress-image')).toBe('compress');
    expect(handoffKeyFor('sign')).toBe('sign');
    expect(handoffKeyFor('image-to-pdf')).toBe('image-to-pdf');
  });
});
