import { test, expect } from '@playwright/test';

const fileName = 'תעודת זהות דיגיטלית - רקפת (2).pdf';

async function seedRecentFiles(page, entries) {
  await page.addInitScript((recentFiles) => {
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify(recentFiles));
  }, entries);
}

test.describe('home launcher shell', () => {
  // The dropzone and the recent-documents card used to be a client:only
  // island, so nothing inside #home-files existed until the Preact bundle had
  // loaded and they popped in after the page had painted. The shell is server
  // rendered now; running with JavaScript disabled is the only way to prove
  // the markup is in the document rather than merely quick to hydrate.
  test.use({ javaScriptEnabled: false });

  test('server-renders the picker and the starter document', async ({ page }) => {
    await page.goto('/');

    const launcher = page.locator('#home-files');
    await expect(launcher.getByText('Choose files', { exact: true })).toBeVisible();
    await expect(launcher.getByText('or drop PDFs here', { exact: true })).toBeVisible();
    await expect(launcher.getByRole('button', { name: /Open bundled sample PDF/ })).toBeVisible();
    await expect(launcher.locator('img')).toHaveAttribute('src', '/images/redaction-guide/sample-preview.jpg');
  });
});

test.describe('home recent files', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('renders one tile for one stored file through responsive layout changes', async ({ page }) => {
    await seedRecentFiles(page, [
      { id: 'sha256:identity-card', tool: 'sign', fileName, savedAt: Date.now() },
    ]);
    await page.goto('/');

    await expect(page.locator('#home-files li')).toHaveCount(1);
    await expect(page.locator('#home-files li')).toContainText(fileName);

    for (const width of [1024, 390, 1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator('#home-files li')).toHaveCount(1);
    }

    expect(await page.evaluate(() => ({
      roots: document.querySelectorAll('#home-files').length,
      islands: document.querySelectorAll('#home-files astro-island').length,
      lists: document.querySelectorAll('#home-files [data-home-recents] ul').length,
    }))).toEqual({ roots: 1, islands: 1, lists: 1 });
  });

  test('replaces the server-rendered starter card rather than appending to it', async ({ page }) => {
    // The server cannot know about localStorage, so it always renders the
    // starter document. If the client's first render read storage instead,
    // Preact would repair the mismatch by keeping the server's node and
    // appending its own - the duplicate-tile bug this suite exists for.
    await seedRecentFiles(page, [
      { id: 'sha256:identity-card', tool: 'sign', fileName, savedAt: Date.now() },
    ]);
    await page.goto('/');

    await expect(page.locator('#home-files li')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Open bundled sample PDF/ })).toHaveCount(0);
  });

  test('renders two cross-tool records once each', async ({ page }) => {
    const now = Date.now();
    await seedRecentFiles(page, [
      { id: 'sha256:signed', tool: 'sign', fileName, savedAt: now - 1 },
      { id: 'sha256:redacted', tool: 'redact', fileName, savedAt: now },
    ]);
    await page.goto('/');

    const recentFiles = page.locator('#home-files');
    await expect(recentFiles.locator('li')).toHaveCount(2);
    await expect(recentFiles.getByText('Sign & Fill PDF', { exact: true })).toHaveCount(1);
    await expect(recentFiles.getByText('Blur & Redact', { exact: true })).toHaveCount(1);
  });
});
