/**
 * Registers the complete lifecycle for a generated browser-test bundle.
 *
 * Vite preview snapshots dist/ when it starts, while Playwright's beforeAll
 * runs afterwards. Generated files therefore exist on disk but are invisible
 * to the preview server. Loading through this fixture routes the same-origin
 * request directly to the generated file, preserving the application's CSP
 * without relying on that stale file listing.
 *
 * Keeping creation, serving, and cleanup together prevents a new bundle
 * consumer from successfully building a test-only asset but forgetting the
 * route that makes it reachable in a clean E2E run.
 */

/**
 * @param {import('@playwright/test').TestType} test
 * @param {{
 *   filename: string,
 *   build: (filename: string) => Promise<string>,
 *   remove: (path: string | undefined) => void,
 * }} config
 */
export function useTemporaryBundle(test, { filename, build, remove }) {
  let bundlePath;

  test.beforeAll(async () => {
    bundlePath = await build(filename);
  });

  test.afterAll(() => {
    remove(bundlePath);
  });

  return {
    /**
     * Route, visit, and load the bundle as one operation. The route is
     * registered before navigation and the script request, so the preview
     * server never sees it while the script still has a same-origin URL
     * accepted by CSP.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} [url='/sign']
     */
    async open(page, url = '/sign') {
      await page.route(`**/${filename}`, (route) => route.fulfill({ path: bundlePath }));
      await page.goto(url);
      await page.addScriptTag({ url: `/${filename}` });
    },
  };
}
