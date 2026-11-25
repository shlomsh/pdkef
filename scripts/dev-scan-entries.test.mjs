import { expect, it } from 'vitest';
import { getViteConfig } from 'astro/config';
import { resolveConfig } from 'vite';
import { globSync } from 'tinyglobby';

// Astro's dev server scans every component and page under src for dependencies to pre-bundle. Test files must stay out: one that
// reaches a native module (@napi-rs/canvas) fails the whole scan, and then no island hydrates on a cold `astro dev`.
it('the cold dev scan reads the app and no test file', async () => {
  const inline = await getViteConfig({})({ command: 'serve', mode: 'development' });
  const config = await resolveConfig(inline, 'serve');
  const files = globSync(config.environments.client.optimizeDeps.entries, { cwd: config.root });
  expect(files).toContain('src/tools/sign/PdfSignTool.tsx');
  expect(files.filter((file) => /\.test[.-]|^src\/test\//.test(file))).toEqual([]);
});
