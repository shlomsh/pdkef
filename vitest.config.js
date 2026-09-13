import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

const TESTS = 'src/**/*.{test,spec}.{js,jsx,ts,tsx}';
const NEVER = ['node_modules/**', '**/node_modules/**', 'dist/**', 'e2e/**', '.claude/**'];

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
  'src/lib/{compress,compressImage,thumbnails,toImage}.test.js',
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
