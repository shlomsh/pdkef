import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// SITE-42: the launcher takes a file and waits for a tool to be picked in the
// toolbar. Only rendered geometry lives here (what is lit stays in view on a
// phone; the waiting tile keeps long names off its own arrow); the routing
// itself is unit-tested in src/site-lib/FileDropzone.test.tsx.

const SAMPLE_PDF = readFileSync('public/images/redaction-guide/sample.pdf');
const PHOTO = readFileSync('public/images/redaction-guide/blackout-before.jpg');

const pick = async (page, file) => {
  await page.goto('/');
  await page.locator('.home-hero [data-home-picker]').waitFor();
  // The change handler is attached with the island; the input is hidden, so
  // setInputFiles drives the same onChange a real picker would.
  await page.locator('.home-hero input[type="file"]').setInputFiles(file);
  await expect(page.locator('.home-hero')).toHaveAttribute('data-picking', '');
};

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('one photo lights the two image tools and scrolls both fully into view', async ({ page }) => {
    await pick(page, { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: PHOTO });

    const lit = page.locator('.home-dock a[data-fits]');
    await expect(lit).toHaveCount(2);
    expect(await lit.evaluateAll((links) => links.map((link) => link.dataset.tool).sort()))
      .toEqual(['compress-image', 'image-to-pdf']);

    // The dock scrolls smoothly; poll until both sit inside the viewport.
    await expect
      .poll(() =>
        lit.evaluateAll((links) =>
          links.every((link) => {
            const rect = link.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
          }),
        ),
      )
      .toBe(true);
  });
});

const NAMES = [
  'BLeumi_20260730163241_327698221_TeudatNeche_final_version_signed.pdf',
  'תעודת זהות וספח (2).pdf',
];

for (const [label, viewport] of [['phone', { width: 375, height: 812 }], ['desktop', { width: 1280, height: 800 }]]) {
  test.describe(`${label} long names`, () => {
    test.use({ viewport });

    for (const name of NAMES) {
      test(`${name} stays inside the waiting tile and clear of the arrow`, async ({ page }) => {
        await pick(page, { name, mimeType: 'application/pdf', buffer: SAMPLE_PDF });

        const geometry = await page.evaluate(() => {
          const tile = document.querySelector('.home-hero [data-home-picker]');
          const box = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          };
          return {
            tile: box(tile),
            arrow: box(tile.querySelector('svg[viewBox="0 0 40 72"]')),
            parts: ['bdi', 'em', 'span'].map((tag) => ({ tag, ...box(tile.querySelector(tag)) })),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });

        expect(geometry.arrow.right - geometry.arrow.left).toBeGreaterThan(0);
        for (const part of geometry.parts) {
          expect(part.left, `${part.tag} left`).toBeGreaterThanOrEqual(geometry.tile.left - 0.5);
          expect(part.right, `${part.tag} right`).toBeLessThanOrEqual(geometry.tile.right + 0.5);
          const apart =
            part.right <= geometry.arrow.left || part.left >= geometry.arrow.right ||
            part.bottom <= geometry.arrow.top || part.top >= geometry.arrow.bottom;
          expect(apart, `${part.tag} clear of the arrow`).toBe(true);
        }
        expect(geometry.overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}
