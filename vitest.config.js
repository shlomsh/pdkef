import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

const TESTS = 'src/**/*.{test,spec}.{js,jsx,ts,tsx}';
// src/tools/<tool>/e2e/ (ARCH-17) holds Playwright specs, not Vitest ones; TESTS'
// src/**/*.spec.js would otherwise pick them up the way e2e/**'s own top-level
// exclusion used to make unnecessary.
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
  'src/lib/use*.{test,spec}.*',
  // Literal path list, not a wildcard-folder glob, because compress/compressImage
  // and toImage are single-tool (ARCH-17 moves them to src/tools/<tool>/) while
  // thumbnails.js has more than one tool consumer (docs/module-boundaries.md's
  // lib consumer table) and stays in src/lib/. Both the pre-move (src/lib/) and
  // post-move (src/tools/<tool>/) locations are listed so this line does not
  // need editing again the moment a tool moves.
  'src/lib/{compress,compressImage,thumbnails,toImage}.test.js',
  'src/tools/*/{compress,compressImage,toImage}.test.js',
  'src/editor/workspace/**/*.{test,spec}.{js,jsx,ts,tsx}',
  'src/editor/gestures/**/*.{test,spec}.{js,jsx,ts,tsx}',
  'src/editor/adapters/pdf/redact.test.js',
];

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
      'astro:content': new URL('./src/test/astroContentStub.js', import.meta.url).pathname
    }
  },
  test: {
    setupFiles: ['./src/test/setup.js'],
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
          exclude: NEVER,
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [TESTS],
          exclude: [...NEVER, ...DOM_TESTS],
        },
      },
    ],
  },
});
