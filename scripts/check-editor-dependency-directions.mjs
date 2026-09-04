import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const TEST_FILE = /\.(?:test|contract)\.[cm]?[jt]sx?$/;
const PDF_PACKAGES = new Set(['@cantoo/pdf-lib', '@pdf-lib/fontkit', 'pdfjs-dist']);

// These are seams, not broad layer permissions. Keeping them explicit makes a
// new renderer or framework hook a deliberate architectural decision.
const EXCEPTIONS = [
  {
    from: 'src/editor/registry/renderers.ts',
    targetPrefix: 'src/components/SignTool/',
    reason: 'registry view adapter renders the Preact node variants',
  },
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
    from: 'src/editor/registry/text.ts',
    target: 'src/components/SignTool/EditorElement.module.css',
    reason: 'text resize paint uses the shell-owned CSS Module class map',
  },
  {
    from: 'src/editor/workspace/useEditorDraftPersistence.ts',
    package: 'preact/hooks',
    reason: 'workspace lifecycle bridge owns draft restore and autosave wiring',
  },
  {
    from: 'src/editor/workspace/useEditorDraftPersistence.ts',
    target: 'src/components/SignTool/useDraftPersistence.js',
    reason: 'temporary draft-effect bridge until the implementation moves into workspace',
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

function collectSourceFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, files);
    } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name)) && !TEST_FILE.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function staticImportSpecifiers(source) {
  // Imports in this codebase are semicolon-terminated. Limiting the scan to a
  // statement prevents an unrelated later `from` from being associated with a
  // side-effect import, while deliberately excluding dynamic import().
  const pattern = /^\s*(?:import(?!\s*\()|export)\s+[^;]*?\sfrom\s+['"]([^'"]+)['"]\s*;?|^\s*import\s*['"]([^'"]+)['"]\s*;?/gm;
  const specifiers = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1] || match[2]);
  }
  return specifiers;
}

function resolveRelativeImport(fromFile, specifier) {
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
      && /\bsrc\/components\/(?:PdfSignTool|PdfRedactTool)\.tsx$|\bsrc\/components\/SignTool\//.test(from)
      && usesBrowserStorage(source)) {
      violations.push({
        from,
        specifier: 'browser storage',
        reason: 'editor components must use editor/workspace persistence instead of direct browser storage',
      });
    }
    for (const specifier of staticImportSpecifiers(source)) {
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
