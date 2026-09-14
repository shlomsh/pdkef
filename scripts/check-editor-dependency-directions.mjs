import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSourceFiles, importSpecifiers } from './check-module-boundaries.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');
// The file walk and import-specifier regex are check-module-boundaries.mjs's
// (AST-diffed against every source file by src/test/moduleBoundariesImportScan.test.js;
// this guard has no scanner test of its own). Only that scanner sees .astro
// frontmatter and dynamic/type-only `import(...)` the old copy here deliberately
// skipped, so DEBT-12 diffed this guard's resolved edges before and after the
// switch: the set only grew, by edges either outside src/editor/ entirely or
// already permitted by the rules below (a dynamic `import('./textPdf.ts')`, a
// JSDoc `@param {import(...)}` type reference). Two JSDoc paths that undercounted
// their `../` and one `.astro`-only `?raw` asset import were the only fallout;
// the JSDoc paths were fixed at the source and resolveRelativeImport strips a
// trailing `?query` the same way check-module-boundaries.mjs's own resolver
// does. layerFor, resolution and the rule matrix below stay this file's own.
const PDF_PACKAGES = new Set(['@cantoo/pdf-lib', '@pdf-lib/fontkit', 'pdfjs-dist']);

// These are seams, not broad layer permissions. Keeping them explicit makes a
// new renderer or framework hook a deliberate architectural decision.
//
// ARCH-19 removed the `renderers.ts -> src/components/SignTool/` targetPrefix
// exception below: the registry used to import the Preact node components
// directly, an editor -> tool edge. It is inverted now (renderers.ts exports
// createElementRenderers, a factory each tool calls once with its own node
// components; Sign's PdfWorkspace.tsx builds its map at module load, before
// any render, DEBT-09), so nothing under src/editor/registry/renderers.ts
// imports from src/components/ any more - only the `preact` exception below
// remains, for the registry still creating Preact vnodes from whatever
// component was supplied. The same ticket removed the
// `text.ts -> EditorElement.module.css` exception below (via a class-name
// registry that DEBT-08 then deleted): text.ts's resize paint finds its DOM
// parts with `data-text-part` attributes (`registry/text.ts`'s `writeDOM`), so
// it needs no class names, resolved or otherwise, and no longer imports the
// tool's CSS Module at all. ARCH-19 also removed the
// `useEditorDraftPersistence.ts -> SignTool/useDraftPersistence.js` exception:
// that hook had no Sign-specific logic (only draftStore.js/draftValidation.ts,
// both already core) and simply moved to
// src/editor/workspace/useDraftPersistence.js, re-exported from its old
// SignTool path for callers outside the editor, which is why a
// `useDraftPersistence.js -> preact/hooks` exception existed for a while.
// DEBT-04 (move A) moved `draftStore.js`/`draftPolicy.js`/`useDraftPersistence.js`
// out of `src/editor/workspace/` to `src/lib/drafts/` (draft persistence has
// consumers outside Sign/Redact - shell, lib, Merge - so it is not editor-core
// scoped), which drops that exception entirely: the hook is no longer under
// `src/editor/` at all, so this guard's workspace-layer rules do not apply to
// it. `useEditorDraftPersistence.ts` (the thin workspace-lifecycle bridge that
// stays in the editor because it depends on the registry) keeps its own
// `preact/hooks` exception below unchanged.
const EXCEPTIONS = [
  {
    from: 'src/editor/registry/renderers.ts',
    package: 'preact',
    reason: 'registry view adapter creates Preact vnodes',
  },
  {
    from: 'src/editor/registry/redactionSurface.ts',
    package: 'preact',
    reason: 'registry redaction view adapter creates a Preact surface',
  },
  {
    from: 'src/editor/workspace/useEditorDraftPersistence.ts',
    package: 'preact/hooks',
    reason: 'workspace lifecycle bridge owns draft restore and autosave wiring',
  },
  {
    from: 'src/editor/text/textCoverage.js',
    target: 'src/editor/registry/text.ts',
    reason: 'temporary coverage export bridge; keep the public text-coverage API stable',
  },
];

function parseRoot(argv) {
  const index = argv.indexOf('--root');
  if (index === -1) return DEFAULT_ROOT;
  if (!argv[index + 1]) throw new Error('--root requires a directory');
  return path.resolve(argv[index + 1]);
}

// Extension-swap candidates only; file collection and import parsing come
// from check-module-boundaries.mjs (imported above).
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

function resolveRelativeImport(fromFile, specifierRaw) {
  const specifier = specifierRaw.split('?')[0]; // strip a Vite `?raw`/`?url` query, as .astro imports can carry one
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const requested = specifier.startsWith('/')
    ? path.resolve(specifier)
    : path.resolve(path.dirname(fromFile), specifier);
  const candidates = [requested];
  const extension = path.extname(requested);
  if (extension) candidates.push(...SOURCE_EXTENSIONS.map((candidateExtension) => `${requested.slice(0, -extension.length)}${candidateExtension}`));
  else candidates.push(...SOURCE_EXTENSIONS.map((candidateExtension) => `${requested}${candidateExtension}`));
  candidates.push(...SOURCE_EXTENSIONS.map((candidateExtension) => path.join(requested, `index${candidateExtension}`)));
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function layerFor(relativePath) {
  if (relativePath.startsWith('src/editor/model/')) return 'model';
  if (relativePath.startsWith('src/editor/geometry/')) return 'geometry';
  if (relativePath.startsWith('src/editor/text/')) return 'text';
  if (relativePath.startsWith('src/editor/registry/')) return 'registry';
  if (relativePath.startsWith('src/editor/adapters/pdf/')) return 'pdf-adapter';
  if (relativePath.startsWith('src/editor/workspace/')) return 'workspace';
  if (relativePath.startsWith('src/components/')) return 'component-shell';
  // ARCH-17 moves tool islands out of the flat src/components/ into
  // src/tools/<name>/ one tool at a time; each one is still the product-UI
  // layer this guard calls 'component-shell', just at a new path.
  if (/^src\/tools\/[^/]+\//.test(relativePath)) return 'component-shell';
  // ARCH-16 split the flat src/components/ into src/shell/ (generic tool
  // chrome) and src/editor-ui/ (Sign/Redact's shared toolbar surface). Both
  // are product UI from this guard's point of view, same as component-shell:
  // the editor layers below may reach them only through the documented
  // renderer/CSS seams, never a direct import.
  if (relativePath.startsWith('src/shell/')) return 'component-shell';
  if (relativePath.startsWith('src/editor-ui/')) return 'component-shell';
  return 'other';
}

function packageRoot(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

function isException(from, target, specifier) {
  return EXCEPTIONS.some((exception) => exception.from === from
    && (exception.package === specifier
      || exception.target === target
      || (exception.targetPrefix && target?.startsWith(exception.targetPrefix))));
}

function strippedSource(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function usesBrowserStorage(source) {
  return /\b(?:localStorage|sessionStorage|indexedDB)\b/.test(strippedSource(source));
}

function violationFor({ from, target, specifier }) {
  if (isException(from, target, specifier)) return null;
  const sourceLayer = layerFor(from);
  const targetLayer = target ? layerFor(target) : null;
  const isPreact = specifier === 'preact' || specifier.startsWith('preact/');
  const isPdfPackage = PDF_PACKAGES.has(packageRoot(specifier));
  const isCss = target?.endsWith('.css') || specifier.endsWith('.css');

  if (sourceLayer === 'model') {
    if (isPreact || isPdfPackage || isCss || (targetLayer && targetLayer !== 'model')) {
      return 'model is pure: it may only import model code, never UI, CSS, browser storage, or PDF libraries';
    }
  }

  if (sourceLayer === 'geometry') {
    if (isPreact || isPdfPackage || isCss || ['text', 'registry', 'pdf-adapter', 'workspace', 'component-shell'].includes(targetLayer)) {
      return 'geometry is pure: it may depend on geometry/model helpers, never UI, CSS, workspace, registry, or PDF libraries';
    }
  }

  if (sourceLayer === 'text') {
    if (isPreact || isCss || ['pdf-adapter', 'workspace', 'component-shell'].includes(targetLayer)) {
      return 'text policy must not depend on Preact, CSS, workspace, PDF adapters, or product UI';
    }
  }

  if (sourceLayer === 'registry') {
    if (targetLayer === 'workspace' || targetLayer === 'pdf-adapter') {
      return 'registry owns element behavior and must not reach into workspace orchestration or PDF adapters';
    }
    if (targetLayer === 'component-shell') {
      return 'registry may only reach the component shell through the documented renderer/CSS seams';
    }
    if (isPreact) return 'registry may only import Preact through the documented view-renderer seams';
    if (isCss) return 'registry may only import CSS through the documented text resize-paint seam';
  }

  if (sourceLayer === 'workspace' && (targetLayer === 'component-shell' || isPreact || isCss)) {
    return 'workspace may only reach Preact or the component shell through the documented draft-effect bridge';
  }

  if (sourceLayer === 'pdf-adapter' && (targetLayer === 'component-shell' || isPreact || isCss)) {
    return 'PDF adapters are one-way: they must not import UI components, Preact, or CSS';
  }

  return null;
}

function checkProject(projectRoot) {
  const sourceRoot = path.join(projectRoot, 'src');
  if (!fs.existsSync(sourceRoot)) throw new Error(`Missing source directory: ${sourceRoot}`);
  const violations = [];

  for (const file of collectSourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    const from = path.relative(projectRoot, file).split(path.sep).join('/');
    const sourceLayer = layerFor(from);
    if (['model', 'geometry'].includes(sourceLayer) && usesBrowserStorage(source)) {
      violations.push({
        from,
        specifier: 'browser storage',
        reason: `${sourceLayer} is pure: it must not access localStorage, sessionStorage, or indexedDB`,
      });
    }
    if (sourceLayer === 'component-shell'
      && /\bsrc\/tools\/redact\/PdfRedactTool\.tsx$|\bsrc\/tools\/sign\//.test(from)
      && usesBrowserStorage(source)) {
      violations.push({
        from,
        specifier: 'browser storage',
        reason: 'editor components must use editor/workspace persistence instead of direct browser storage',
      });
    }
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveRelativeImport(file, specifier);
      if ((specifier.startsWith('.') || specifier.startsWith('/')) && !resolved) {
        violations.push({ from, specifier, reason: 'relative static import does not resolve to a source file' });
        continue;
      }
      const target = resolved ? path.relative(projectRoot, resolved).split(path.sep).join('/') : null;
      const reason = violationFor({ from, target, specifier });
      if (reason) violations.push({ from, target, specifier, reason });
    }
  }

  return violations;
}

function main() {
  const projectRoot = parseRoot(process.argv.slice(2));
  const violations = checkProject(projectRoot);
  if (violations.length > 0) {
    console.error('Editor dependency-direction guard failed:');
    for (const violation of violations) {
      const destination = violation.target || violation.specifier;
      console.error(`  ${violation.from} -> ${destination}: ${violation.reason}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('Editor dependency-direction guard passed: resolved static imports respect the editor matrix.');
}

main();
