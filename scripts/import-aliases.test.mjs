import { describe, expect, it } from 'vitest';
import { IMPORT_ALIASES, aliasTarget, readImportAliases } from './import-aliases.mjs';

// ARCH-44: one alias table, read from package.json "imports", shared by every script that resolves imports.
const pkg = { imports: { '#lib/*': './src/lib/*', '#editor/*': './src/editor/*', '#editor-ui/*': './src/editor-ui/*' } };

describe('readImportAliases', () => {
  it('maps each "#layer/*" key to its repo-relative folder', () => {
    expect([...readImportAliases(pkg)]).toEqual([['#lib/', 'src/lib/'], ['#editor/', 'src/editor/'], ['#editor-ui/', 'src/editor-ui/']]);
  });

  it('ignores a package.json with no imports field', () => {
    expect(readImportAliases({}).size).toBe(0);
  });

  it('reads the four layer aliases from the live package.json', () => {
    expect([...IMPORT_ALIASES.keys()]).toEqual(['#lib/', '#editor/', '#editor-ui/', '#shell/']);
  });
});

describe('aliasTarget', () => {
  const aliases = readImportAliases(pkg);

  it('maps an alias specifier to a repo-relative path', () => {
    expect(aliasTarget('#lib/pdf/openPdfDoc.ts', aliases)).toBe('src/lib/pdf/openPdfDoc.ts');
  });

  it('keeps #editor and #editor-ui apart', () => {
    expect(aliasTarget('#editor-ui/ArmHint.tsx', aliases)).toBe('src/editor-ui/ArmHint.tsx');
    expect(aliasTarget('#editor/model/model.ts', aliases)).toBe('src/editor/model/model.ts');
  });

  it('returns null for relative, absolute and bare specifiers', () => {
    expect(aliasTarget('../lib/x.ts', aliases)).toBeNull();
    expect(aliasTarget('/src/lib/x.ts', aliases)).toBeNull();
    expect(aliasTarget('pdfjs-dist', aliases)).toBeNull();
    expect(aliasTarget('#unknown/x.ts', aliases)).toBeNull();
  });
});
