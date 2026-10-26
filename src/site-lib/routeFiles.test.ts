import { describe, expect, it } from 'vitest';
import { listedTools } from '../data/tools.js';
import { handoffKeyFor, routeFiles } from './routeFiles';

const f = (name: string, type = '') => new File(['x'], name, { type });
const PDF_TOOLS = ['sign', 'redact', 'merge', 'pdf-to-image', 'split', 'compress', 'unlock', 'organize-pdf'];
const names = (files: File[]) => files.map((x) => x.name);

describe('routeFiles', () => {
  it.each([
    ['empty list', [], 'none', 'unsupported', [], []],
    ['one pdf', [f('a.pdf', 'application/pdf')], 'choose', [...PDF_TOOLS], ['a.pdf'], []],
    ['one pdf, empty type, .PDF name', [f('A.PDF')], 'choose', [...PDF_TOOLS], ['A.PDF'], []],
    ['one pdf plus skipped', [f('n.txt', 'text/plain'), f('a.pdf'), f('p.heic')], 'choose', [...PDF_TOOLS], ['a.pdf'], ['n.txt', 'p.heic']],
    ['two pdfs keep order', [f('b.pdf'), f('a.PDF', 'application/pdf')], 'open', 'merge', ['b.pdf', 'a.PDF'], []],
    ['two pdfs plus skipped', [f('x.txt'), f('b.pdf'), f('y.heic'), f('a.pdf')], 'open', 'merge', ['b.pdf', 'a.pdf'], ['x.txt', 'y.heic']],
    ['one photo by type', [f('p', 'image/png')], 'choose', ['image-to-pdf', 'compress-image'], ['p'], []],
    ['one photo uppercase ext', [f('P.JPEG')], 'choose', ['image-to-pdf', 'compress-image'], ['P.JPEG'], []],
    ['one photo plus skipped', [f('p.jpg'), f('n.txt')], 'choose', ['image-to-pdf', 'compress-image'], ['p.jpg'], ['n.txt']],
    ['two photos keep order', [f('z.PNG'), f('a.jpg', 'image/jpeg')], 'open', 'image-to-pdf', ['z.PNG', 'a.jpg'], []],
    ['two photos plus skipped', [f('s.heic'), f('z.png'), f('a.JPG')], 'open', 'image-to-pdf', ['z.png', 'a.JPG'], ['s.heic']],
    ['pdf and photo', [f('a.pdf'), f('p.jpg'), f('n.txt')], 'open', 'merge', ['a.pdf', 'p.jpg'], ['n.txt']],
    ['photo, pdf, photo keep pick order', [f('p.jpg'), f('a.pdf'), f('q.PNG')], 'open', 'merge', ['p.jpg', 'a.pdf', 'q.PNG'], []],
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

  it('lists choices in src/data/tools.js order', () => {
    const order = listedTools.map((t: { slug: string }) => t.slug);
    for (const input of [[f('a.pdf')], [f('p.jpg')]]) {
      const r = routeFiles(input);
      if (r.kind !== 'choose') throw new Error('expected choose');
      expect(r.tools).toEqual(order.filter((s: string) => r.tools.includes(s as never)));
    }
  });
});

describe('handoffKeyFor', () => {
  it('maps compress-image to compress and leaves other slugs alone', () => {
    expect(handoffKeyFor('compress-image')).toBe('compress');
    expect(handoffKeyFor('organize-pdf')).toBe('edit-pdf');
    expect(handoffKeyFor('sign')).toBe('sign');
    expect(handoffKeyFor('image-to-pdf')).toBe('image-to-pdf');
  });
});
