import { test, expect } from '@playwright/test';

// E7.8(b) - a runtime-CSP smoke that fails on *any* unexpected
// securitypolicyviolation event, not just the two editor tools' gesture
// flows. `npm run test:csp` (scripts/verify-csp.js) only diffs the emitted
// `<meta>` CSP hash list against the static inline scripts/styles it can see
// in the built HTML - it cannot observe an actual violation firing in a
// browser. E1.7 wired the securitypolicyviolation listener into the Sign and
// Redact editor specs; this spec reuses the same listener but sweeps every
// indexed route on a plain page load, so a regression on the marketing/SEO
// surface (or any future route) is caught even if it never touches the
// editor gesture path.
//
// Uses page.addInitScript so the listener is attached before any script on
// the page runs, including the astro-island hydration bootstrap - matching
// the pattern in e2e/sign/sign-editor.spec.js and e2e/redact/redact-editor.spec.js.

const routes = [
  '/',
  '/merge',
  '/split',
  '/compress',
  '/pdf-to-image',
  '/image-to-pdf',
  '/unlock',
  '/sign',
  '/redact',
  '/edit-pdf',
  '/licenses',
];

async function collectCspViolations(page) {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    window.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.effectiveDirective}: ${e.blockedURI || e.sourceFile}`);
    });
  });
}

test('every indexed route loads with zero CSP violations', async ({ page }) => {
  for (const route of routes) {
    await collectCspViolations(page);
    await page.goto(route);
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor({ timeout: 10_000 }).catch(() => {});

    const violations = await page.evaluate(() => window.__cspViolations || []);
    expect(violations, `${route} produced unexpected CSP violations:\n${violations.join('\n')}`).toEqual([]);
  }
});
