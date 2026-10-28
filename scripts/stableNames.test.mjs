import { describe, expect, it } from 'vitest';
import { entryFileName, chunkFileName, SITE_DIR, SHARED_DIR, HOT_SHARED_CHUNKS } from './stableNames.mjs';

describe('stable names (MEM-25)', () => {
  it('names an entry under the site folder with no hash', () => {
    expect(entryFileName({ name: 'PdfMergeTool' })).toBe(`${SITE_DIR}/PdfMergeTool.js`);
  });

  it('sanitizes characters a URL or file name should not carry', () => {
    expect(entryFileName({ name: 'pages/a b$c' })).toBe(`${SITE_DIR}/pages_a_b_c.js`);
    expect(entryFileName({ name: 'x.y@1-2' })).toBe(`${SITE_DIR}/x_y@1-2.js`);
    // Astro names script entries `BaseLayout.astro_astro_type_script_index_1_lang`; a stable name keeps no inner dot.
    expect(entryFileName({ name: 'BaseLayout.astro_astro_type_script_index_1_lang' })).toBe(`${SITE_DIR}/BaseLayout_astro_astro_type_script_index_1_lang.js`);
  });

  it('puts each hot shared chunk in the shared folder with no hash', () => {
    for (const name of HOT_SHARED_CHUNKS) expect(chunkFileName({ name })).toBe(`${SHARED_DIR}/${name}.js`);
  });

  it('keeps every other chunk content-hashed in _astro', () => {
    expect(chunkFileName({ name: 'pdf-lib' })).toBe('_astro/[name].[hash].js');
  });
});
