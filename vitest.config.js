import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';
import { playwright } from '@vitest/browser-playwright';

const TESTS = 'src/**/*.{test,spec}.{js,jsx,ts,tsx}';
// src/tools/<tool>/e2e/ (ARCH-17) holds Playwright specs, not Vitest ones; TESTS'
// src/**/*.spec.js would otherwise pick them up the way e2e/**'s own top-level
// exclusion used to make unnecessary.
const BROWSER_TESTS = 'src/**/*.browser.test.{js,jsx,ts,tsx}';
const DESKTOP_BROWSER_TESTS = [
  'src/tools/redact/PdfRedactTool.*.browser.test.tsx',
  'src/tools/edit-pages/PdfEditPagesTool.undo.browser.test.tsx',
  'src/tools/scan/PdfScanTool.{table,corners,viewer,result}.browser.test.tsx',
];
const CAMERA_BROWSER_TESTS = ['src/tools/scan/**/*.camera.browser.test.{ts,tsx}'];
const NEVER = ['node_modules/**', '**/node_modules/**', 'dist/**', 'e2e/**', 'src/tools/*/e2e/**', '.claude/**'];

// Booting jsdom cost more than running the tests (Vitest's own breakdown:
// environment 97s of CPU against tests 39s), and 85 of 143 files never touch
// a DOM. So jsdom is opt-in by location: components, hooks, the workspace and
// gesture layers, and the lib tests that decode images or drive pdf.js. A
// pure-logic test anywhere else runs under node and gets a loud
// "document is not defined" if it does need a DOM; move it, or put
// `// @vitest-environment jsdom` at the top of the file.
const DOM_TESTS = [
  'src/components/**/*.{test,spec}.{js,jsx,ts,tsx}',
  'src/**/*.{test,spec}.{jsx,tsx}',
  'src/lib/{handoff,hooks,output}/use*.{test,spec}.*',
  // DEBT-04 (move A): draftStore.js/draftPolicy.js/useDraftPersistence.js moved here from
  // src/editor/workspace/; draftStore.test.js drives localStorage and fake-indexeddb directly.
  // Named list, not a wildcard, because DEBT-05 added
  // draftStoreServiceWorkerSync.test.js to this same folder: it only reads
  // draftStore.js and public/sw.js as text with node:fs, so it stays a node
  // test rather than paying for jsdom it never touches.
  'src/lib/drafts/{draftPolicy,draftStore}.test.js',
  'src/lib/drafts/draftRemoval.test.ts',
  'src/lib/drafts/draftRemovalWatch.test.ts',
  // Literal path list, not a wildcard-folder glob, because compress/compressImage
  // and toImage are single-tool (ARCH-17 moves them to src/tools/<tool>/) while
  // thumbnails.js has more than one tool consumer (docs/module-boundaries.md's
  // lib consumer table) and stays in src/lib/. Both the pre-move (src/lib/) and
  // post-move (src/tools/<tool>/) locations are listed so this line does not
  // need editing again the moment a tool moves.
  'src/lib/{compress,compressImage,toImage}.test.js',
  'src/lib/pdf/thumbnails.test.js',
  'src/tools/*/{compress,compressImage,toImage}.test.js',
  'src/tools/to-image/lib/toImage.test.js',
  'src/tools/compress/lib/{compress,compressImage}.test.js',
  // ARCH-18: Sign's own use*.test.js/.test.ts moved out of src/lib/ (the
  // 'src/lib/{handoff,hooks,output}/use*' line above no longer reaches them) into src/tools/sign/,
  // flat and under components/. Only this one drives real gesture/pointer
  // dispatch through window listeners; useWorkspaceGestures.contract.test.ts,
  // signExportReadiness.test.ts, fontOfflinePacks.test.js and the three
  // src/tools/sign/components/*.contract.test.ts/*.undo.test.ts files are
  // pure-logic and stay under node (proven by running them there).
  'src/tools/sign/hooks/useWorkspaceGestures.test.js',
  'src/editor/workspace/**/*.{test,spec}.{js,jsx,ts,tsx}',
  'src/tools/sign/lib/signatureImagePolicy.test.ts',
  // DEBT-04 (part 2): the gesture controller moved to src/lib/gestures/ (shell's
  // CompareSlider needed it too), taking its DOM-driving test with it.
  'src/lib/gestures/**/*.{test,spec}.{js,jsx,ts,tsx}',
  'src/tools/redact/lib/redact.test.js',
];

const serveMswWorker = {
  name: 'serve-msw-worker',
  configureServer(server) {
    server.middlewares.use('/mockServiceWorker.js', (_request, response) => {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(readFileSync(new URL('./src/test/browser-public/mockServiceWorker.js', import.meta.url)));
    });
  },
};

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
      // Build-only virtual module; see the stub for why documentation.ts has to
      // name it with a literal specifier that Vitest then cannot resolve.
      'astro:content': new URL('./src/test/support/astroContentStub.js', import.meta.url).pathname
    }
  },
  test: {
    // QUAL-52: a worker stuck in a loop that never yields would otherwise outlive its parent for good.
    execArgv: ['--import', new URL('./scripts/vitest-worker-watchdog.mjs', import.meta.url).href],
    setupFiles: ['./src/test/support/setup.js'],
    server: {
      deps: {
        inline: [/@floating-ui/]
      }
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: DOM_TESTS,
          exclude: [...NEVER, BROWSER_TESTS],
        },
      },
      {
        extends: true,
        plugins: [serveMswWorker],
        // Found only partway through a run, these made Vite re-optimize and reload the test page, and the file
        // it was loading then failed with "Failed to fetch dynamically imported module" (LAND-04 wave 6).
        optimizeDeps: { include: ['@cantoo/pdf-lib', 'pdfjs-dist/build/pdf.worker.min.mjs'] },
        test: {
          name: 'browser',
          include: [BROWSER_TESTS],
          exclude: NEVER,
          fileParallelism: false,
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [
              { browser: 'chromium', exclude: [...NEVER, ...DESKTOP_BROWSER_TESTS, ...CAMERA_BROWSER_TESTS] },
              { browser: 'chromium', name: 'browser (desktop chromium)', viewport: { width: 1280, height: 800 }, include: DESKTOP_BROWSER_TESTS },
              {
                browser: 'chromium',
                name: 'browser (touch chromium with a camera)',
                include: CAMERA_BROWSER_TESTS,
                provider: playwright({
                  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
                  contextOptions: { hasTouch: true },
                }),
              },
            ],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          // DEBT-05: scripts/*.test.mjs test scripts/*.mjs beside their subject,
          // not under src/lib/.
          include: [TESTS, 'scripts/**/*.test.mjs'],
          exclude: [...NEVER, BROWSER_TESTS, ...DOM_TESTS],
        },
      },
    ],
  },
});
