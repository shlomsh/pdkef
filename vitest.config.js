import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

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
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules/**', '**/node_modules/**', 'dist/**', 'e2e/**', '.claude/**'],
    server: {
      deps: {
        inline: [/@floating-ui/]
      }
    }
  },
});
