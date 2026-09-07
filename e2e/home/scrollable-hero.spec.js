import { test, expect } from '@playwright/test';

const mobileViewports = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];

async function homeStructure(page) {
  return page.evaluate(() => {
    const hero = document.querySelector('.home-hero');
    const appBar = hero?.querySelector('[data-home-bar]');
    const heading = hero?.querySelector('.hero-header');
    const workspace = document.getElementById('home-files');
    const dock = document.querySelector('.home-dock');
    const tour = document.getElementById('home-tour');
    const follows = (first, second) => Boolean(
      first && second && (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING),
    );

    return {
      heroExists: Boolean(hero),
      heroContains: Boolean(appBar && heading && workspace && dock)
        && hero.contains(appBar)
        && hero.contains(heading)
        && hero.contains(workspace)
        && hero.contains(dock),
      order: follows(appBar, heading) && follows(heading, workspace) && follows(workspace, dock) && follows(dock, tour),
      tourFollowsHero: follows(hero, tour),
      heroHeight: hero?.getBoundingClientRect().height ?? 0,
      heroBottom: hero?.getBoundingClientRect().bottom ?? 0,
      tourTop: tour?.getBoundingClientRect().top ?? 0,
      viewportHeight: window.innerHeight,
      positions: [heading, dock].map((element) => element ? getComputedStyle(element).position : null),
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      dockCanScrollInline: Boolean(dock && dock.scrollWidth > dock.clientWidth),
    };
  });
}

test.describe('scrollable home hero', () => {
  for (const viewport of mobileViewports) {
    test(`keeps the complete hero ahead of the demo at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page.locator('#home-files [data-home-picker]').waitFor();

      const structure = await homeStructure(page);
      expect(structure.heroExists).toBe(true);
      expect(structure.heroContains).toBe(true);
      expect(structure.order).toBe(true);
      expect(structure.tourFollowsHero).toBe(true);
      expect(structure.tourTop).toBeGreaterThanOrEqual(structure.heroBottom - 1);
      // min-height: 100svh is deliberately allowed to grow for short screens
      // and text zoom; it must never shrink below the visible small viewport.
      expect(structure.heroHeight).toBeGreaterThanOrEqual(structure.viewportHeight - 1);
      expect(structure.positions).not.toContain('fixed');
      expect(structure.positions).not.toContain('sticky');
      expect(structure.pageOverflow).toBeLessThanOrEqual(1);

      const mobileBar = await page.evaluate(() => {
        const items = [
          document.querySelector('[data-home-bar] [aria-label="PDkef homepage"]'),
          document.querySelector('[data-on-device]'),
          ...document.querySelectorAll('.home-trust .trust-chip'),
        ];
        const boxes = items.map((item) => item.getBoundingClientRect());
        return {
          barHeight: document.querySelector('[data-home-bar]').getBoundingClientRect().height,
          centerSpread: Math.max(...boxes.map((box) => box.top + box.height / 2))
            - Math.min(...boxes.map((box) => box.top + box.height / 2)),
          rightEdge: Math.max(...boxes.map((box) => box.right)),
          viewportWidth: innerWidth,
        };
      });
      expect(mobileBar.barHeight).toBeLessThanOrEqual(57);
      expect(mobileBar.centerSpread).toBeLessThanOrEqual(1);
      expect(mobileBar.rightEdge).toBeLessThanOrEqual(mobileBar.viewportWidth);

      if (viewport.width === 390) {
        // The launcher keeps its existing horizontal rail instead of forcing
        // nine small controls into a wrapped, clipped layout.
        expect(structure.dockCanScrollInline).toBe(true);
      }

      await page.evaluate(() => {
        const tour = document.getElementById('home-tour');
        window.scrollTo(0, tour.offsetTop + Math.min(200, tour.offsetHeight / 4));
      });
      await expect(page.locator('body')).toHaveAttribute('data-home-demo-visible', '');
      const demoFrame = await page.evaluate(() => {
        const header = document.querySelector('[data-home-bar]').getBoundingClientRect();
        const footer = document.querySelector('.card-stack footer').getBoundingClientRect();
        const caption = document.querySelector('[class*="caption_"]').getBoundingClientRect();
        const phone = document.querySelector('[class*="phone_"]').getBoundingClientRect();
        return {
          header,
          footer,
          caption,
          phone,
          viewportHeight: innerHeight,
          headerIsTopLayer: Boolean(document.elementFromPoint(innerWidth / 2, 4)?.closest('[data-home-bar]')),
          footerIsTopLayer: Boolean(document.elementFromPoint(innerWidth / 2, innerHeight - 4)?.closest('footer')),
        };
      });
      expect(demoFrame.header.top).toBe(0);
      expect(demoFrame.footer.bottom).toBeCloseTo(demoFrame.viewportHeight, 0);
      expect(demoFrame.caption.top - demoFrame.header.bottom).toBeGreaterThanOrEqual(11);
      expect(demoFrame.phone.top - demoFrame.caption.bottom).toBeGreaterThanOrEqual(11);
      expect(demoFrame.footer.top - demoFrame.phone.bottom).toBeGreaterThanOrEqual(11);
      expect(demoFrame.headerIsTopLayer).toBe(true);
      expect(demoFrame.footerIsTopLayer).toBe(true);
    });
  }

  test('desktop hero frame stays pinned through the demos and then releases', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const before = await page.evaluate(() => {
      const hero = document.querySelector('.home-hero');
      const heading = document.querySelector('.hero-header');
      const dock = document.querySelector('.home-dock');
      const appBar = document.querySelector('[data-home-bar]');
      const appBarInner = appBar?.firstElementChild;
      const scene = document.querySelector('.home-scene');
      return {
        heroHeight: hero?.getBoundingClientRect().height ?? 0,
        headingTop: heading?.getBoundingClientRect().top ?? 0,
        dockTop: dock?.getBoundingClientRect().top ?? 0,
        appBarTop: appBar?.getBoundingClientRect().top ?? 0,
        appBarPosition: appBar ? getComputedStyle(appBar).position : null,
        appBarInnerLeft: appBarInner?.getBoundingClientRect().left ?? 0,
        appBarInnerRight: appBarInner?.getBoundingClientRect().right ?? 0,
        sceneLeft: scene?.getBoundingClientRect().left ?? 0,
        sceneRight: scene?.getBoundingClientRect().right ?? 0,
        positions: [heading, dock].map((element) => element ? getComputedStyle(element).position : null),
      };
    });
    expect(before.heroHeight).toBeGreaterThan(0);
    expect(before.positions).not.toContain('fixed');
    expect(before.positions).not.toContain('sticky');
    expect(before.appBarPosition).toBe('fixed');
    expect(before.appBarTop).toBe(0);
    expect(Math.abs(before.appBarInnerLeft - before.sceneLeft)).toBeLessThan(1);
    expect(Math.abs(before.appBarInnerRight - before.sceneRight)).toBeLessThan(1);

    await page.evaluate(() => {
      const tour = document.getElementById('home-tour');
      const frame = tour.querySelector('[data-demo-frame]');
      const travel = tour.offsetHeight - frame.offsetHeight;
      window.scrollTo(0, tour.offsetTop + travel * 0.5);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    const during = await page.evaluate(() => {
      const heading = document.querySelector('.hero-header');
      const dock = document.querySelector('.home-dock');
      return {
        headingTop: heading?.getBoundingClientRect().top ?? 0,
        dockTop: dock?.getBoundingClientRect().top ?? 0,
      };
    });
    expect(Math.abs(during.headingTop - before.headingTop)).toBeLessThan(2);
    expect(Math.abs(during.dockTop - before.dockTop)).toBeLessThan(2);

    await page.evaluate(() => {
      const tour = document.getElementById('home-tour');
      const frame = tour.querySelector('[data-demo-frame]');
      const travel = tour.offsetHeight - frame.offsetHeight;
      window.scrollTo(0, tour.offsetTop + travel + 120);
    });
    const after = await page.evaluate(() => ({
      headingTop: document.querySelector('.hero-header')?.getBoundingClientRect().top ?? 0,
      dockTop: document.querySelector('.home-dock')?.getBoundingClientRect().top ?? 0,
      appBarTop: document.querySelector('[data-home-bar]')?.getBoundingClientRect().top ?? 0,
    }));
    expect(after.headingTop).toBeLessThan(before.headingTop - 100);
    expect(after.dockTop).toBeLessThan(before.dockTop - 100);
    expect(after.appBarTop).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test('mobile header and footer frame every information card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#home-files [data-home-picker]').waitFor();
    const cards = page.locator('.card-stack .card-reveal');

    for (const index of [0, 1, 3, (await cards.count()) - 1]) {
      await cards.nth(index).evaluate((card) => {
        window.scrollTo(0, card.getBoundingClientRect().top + scrollY - 140);
      });
      await expect(page.locator('body')).toHaveAttribute('data-home-cards-visible', '');
      const frame = await page.evaluate(() => {
        const header = document.querySelector('[data-home-bar]').getBoundingClientRect();
        const footer = document.querySelector('.card-stack footer').getBoundingClientRect();
        return {
          header,
          footer,
          viewportHeight: innerHeight,
          headerIsTopLayer: Boolean(document.elementFromPoint(innerWidth / 2, 4)?.closest('[data-home-bar]')),
          footerIsTopLayer: Boolean(document.elementFromPoint(innerWidth / 2, innerHeight - 4)?.closest('footer')),
        };
      });
      expect(frame.header.top).toBe(0);
      expect(frame.footer.bottom).toBeCloseTo(frame.viewportHeight, 0);
      expect(frame.headerIsTopLayer).toBe(true);
      expect(frame.footerIsTopLayer).toBe(true);
    }
  });
});

test.describe('desktop server-rendered hero frame', () => {
  test.use({ javaScriptEnabled: false });

  test('reserves the workspace column before hydration', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const placement = await page.evaluate(() => {
      const scene = document.querySelector('.home-scene');
      const demo = scene?.querySelector('[data-home-demo]');
      const sceneBox = scene?.getBoundingClientRect();
      const demoBox = demo?.getBoundingClientRect();
      return {
        sceneLeft: sceneBox?.left ?? 0,
        sceneWidth: sceneBox?.width ?? 0,
        demoLeft: demoBox?.left ?? 0,
        column: demo ? getComputedStyle(demo).gridColumnStart : '',
      };
    });

    expect(placement.column).toBe('2');
    expect(placement.demoLeft).toBeGreaterThan(placement.sceneLeft + placement.sceneWidth * 0.4);
  });
});
