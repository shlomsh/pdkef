import { describe, expect, it } from 'vitest';
import { entryFileName, chunkFileName, findRenamedChunks, SITE_DIR, SHARED_DIR } from './stableNames.mjs';

describe('stable names (MEM-25, MEM-31)', () => {
  it('names an entry under the site folder with no hash', () => {
    expect(entryFileName({ name: 'PdfMergeTool' })).toBe(`${SITE_DIR}/PdfMergeTool.js`);
  });

  it('sanitizes characters a URL or file name should not carry', () => {
    expect(entryFileName({ name: 'pages/a b$c' })).toBe(`${SITE_DIR}/pages_a_b_c.js`);
    expect(entryFileName({ name: 'x.y@1-2' })).toBe(`${SITE_DIR}/x_y@1-2.js`);
    // Astro names script entries `BaseLayout.astro_astro_type_script_index_1_lang`; a stable name keeps no inner dot.
    expect(entryFileName({ name: 'BaseLayout.astro_astro_type_script_index_1_lang' })).toBe(`${SITE_DIR}/BaseLayout_astro_astro_type_script_index_1_lang.js`);
  });

  it('puts every chunk in the shared folder with no hash, whatever its name', () => {
    for (const name of ['openPdfDoc', 'sign', 'pdf-lib', 'fonts', 'index']) expect(chunkFileName({ name })).toBe(`${SHARED_DIR}/${name}.js`);
  });
});

describe('findRenamedChunks', () => {
  it('passes chunks that got the file their name asks for', () => {
    expect(findRenamedChunks([
      { name: 'sign', fileName: 'shared/sign.js', isEntry: false },
      { name: 'PdfSignTool', fileName: 'site/PdfSignTool.js', isEntry: true },
    ])).toEqual([]);
  });

  it('names a chunk Rolldown numbered because another asked for the same file', () => {
    const numbered = { name: 'index', fileName: 'shared/index2.js', isEntry: false };
    expect(findRenamedChunks([{ name: 'index', fileName: 'shared/index.js', isEntry: false }, numbered])).toEqual([numbered]);
  });
});
