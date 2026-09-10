import { test, expect } from '@playwright/test';

const mobileViewports = [
  // 1320x2868 at 3x, matching the iPhone capture for this regression.
  { width: 440, height: 956 },
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
    const demoTrack = document.querySelector('.demo-track[data-demo-track="mobile"]');
    const tour = document.getElementById('home-tour');
    const follows = (first, second) => Boolean(
      first && second && (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING),
    );

    return {
      heroExists: Boolean(hero),
      heroContains: Boolean(appBar && heading && workspace && dock && demoTrack)
        && hero.contains(appBar)
        && hero.contains(heading)
        && hero.contains(workspace)
        && hero.contains(dock)
        && hero.contains(demoTrack),
      // Reading order within the first screen. The demo track now sits
      // between the workspace and the dock in source order (see
      // index.astro's single canonical markup), so "the complete hero
      // renders above the demo" is checked below via rendered position
      // instead of a DOM-order chain that no longer matches the design.
      order: follows(appBar, heading) && follows(heading, workspace),
      tourContainsHero: Boolean(tour && hero && tour.contains(hero)),
      dockBottom: dock?.getBoundingClientRect().bottom ?? 0,
      demoTop: demoTrack?.getBoundingClientRect().top ?? 0,
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
      expect(structure.tourContainsHero).toBe(true);
      expect(structure.demoTop).toBeGreaterThanOrEqual(structure.dockBottom - 1);
      // The first screen (header, launcher, dock) is deliberately allowed to
      // grow for short screens and text zoom; it must never shrink below the
      // visible small viewport.
      expect(structure.dockBottom).toBeGreaterThanOrEqual(structure.viewportHeight - 1);
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

      // The persistent demo frame must not activate merely because the demo
      // track is approaching the viewport. iOS can expose a taller innerHeight
      // than its 100svh landing hero while browser chrome settles, which used
      // to make this happen at scrollY=0: the fixed footer covered the home
      // tool dock. The header itself now stays fixed independently of demo
      // activation.
      await expect(page.locator('body')).not.toHaveAttribute('data-home-demo-visible', '');
      const landingFrame = await page.evaluate(() => ({
        appBarPosition: getComputedStyle(document.querySelector('[data-home-bar]')).position,
        footerPosition: getComputedStyle(document.querySelector('.card-stack footer')).position,
      }));
      expect(landingFrame.appBarPosition).toBe('fixed');
      expect(landingFrame.footerPosition).toBe('relative');

      await page.evaluate(() => {
        const demoTrack = document.querySelector('.demo-track[data-demo-track="mobile"]');
        window.scrollTo(0, Math.max(0, demoTrack.offsetTop - innerHeight / 2));
      });
      await expect.poll(() => page.evaluate(() => document.querySelector('.demo-track[data-demo-track="mobile"]').getBoundingClientRect().top))
        .toBeGreaterThan(0);
      await expect(page.locator('body')).not.toHaveAttribute('data-home-demo-visible', '');

      // The header stays visible during the gap before the demo frame starts.
      const approachingHeader = await page.locator('[data-home-bar]').boundingBox();
      expect(approachingHeader.y).toBe(0);
      expect(await page.evaluate(() => Boolean(
        document.elementFromPoint(innerWidth / 2, 4)?.closest('[data-home-bar]'),
      ))).toBe(true);

      // Cross the sticky boundary in both directions: the title must remain
      // below the toolbar without a late padding/height change moving it.
      // The boundary is the demo track's own top - the pinned frame's static
      // position coincides with it, which is where it starts sticking.
      const titlePositions = [];
      for (const offset of [-40, -1, 1, 40, 1, -1, -40]) {
        await page.evaluate(async (offset) => {
          const demoTrack = document.querySelector('.demo-track[data-demo-track="mobile"]');
          window.scrollTo(0, demoTrack.offsetTop + offset);
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, offset);
        const geometry = await page.evaluate(() => ({
          title: document.querySelector('[class*="caption_"]').getBoundingClientRect().top,
          bar: document.querySelector('[data-home-bar]').getBoundingClientRect().bottom,
        }));
        expect(geometry.title - geometry.bar).toBeGreaterThanOrEqual(11);
        titlePositions.push(geometry.title - Math.max(0, -offset));
      }
      expect(Math.max(...titlePositions) - Math.min(...titlePositions)).toBeLessThanOrEqual(2);

      if (viewport.width === 390) {
        // The launcher keeps its existing horizontal rail instead of forcing
        // nine small controls into a wrapped, clipped layout.
        expect(structure.dockCanScrollInline).toBe(true);
      }

      await page.evaluate(() => {
        const demoTrack = document.querySelector('.demo-track[data-demo-track="mobile"]');
        window.scrollTo(0, demoTrack.offsetTop + Math.min(200, demoTrack.offsetHeight / 4));
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
      // The content block used to be one wrapper element. It is now the span
      // between the hero grid's content-start and content-end lines, so it is
      // read off the two items that sit on those lines: the launcher starts
      // at content-start, the demo track ends at content-end. The assertions
      // below are unchanged - the app bar's inner row still has to line up
      // with that block edge to edge.
      const launcher = document.getElementById('home-files');
      const demoTrack = document.querySelector('.demo-track');
      return {
        heroHeight: hero?.getBoundingClientRect().height ?? 0,
        headingTop: heading?.getBoundingClientRect().top ?? 0,
        dockTop: dock?.getBoundingClientRect().top ?? 0,
        appBarTop: appBar?.getBoundingClientRect().top ?? 0,
        appBarPosition: appBar ? getComputedStyle(appBar).position : null,
        // Content edge, not border edge. The app bar's inner row carries the
        // 32px gutter as padding, and the hero grid carries it as a gutter
        // column, so the thing that has to line up is where the *content*
        // starts on each side.
        appBarInnerLeft: appBarInner
          ? appBarInner.getBoundingClientRect().left + parseFloat(getComputedStyle(appBarInner).paddingLeft)
          : 0,
        appBarInnerRight: appBarInner
          ? appBarInner.getBoundingClientRect().right - parseFloat(getComputedStyle(appBarInner).paddingRight)
          : 0,
        sceneLeft: launcher?.getBoundingClientRect().left ?? 0,
        sceneRight: demoTrack?.getBoundingClientRect().right ?? 0,
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
      // The pinned element on desktop is the whole hero (see
      // [data-demo-pin="desktop"] in index.astro and resolvePin() in
      // ScrollDriver.tsx) - not [data-demo-frame], which is only the demo's
      // own cell inside the hero and no longer the full 100svh pin.
      const pin = document.querySelector('[data-demo-pin="desktop"]');
      const travel = tour.offsetHeight - pin.offsetHeight;
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
      const pin = document.querySelector('[data-demo-pin="desktop"]');
      const travel = tour.offsetHeight - pin.offsetHeight;
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

  test('keeps all six recent files, the picker, and the tool dock visible on an iPhone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify(
        Array.from({ length: 6 }, (_, index) => ({
          id: `recent-${index}`,
          tool: index % 2 ? 'redact' : 'sign',
          fileName: `recent-document-${index}.pdf`,
          savedAt: Date.now() - index,
        })),
      ));
    });
    await page.goto('/');
    await expect(page.locator('#home-files li')).toHaveCount(6);

    const landing = await page.evaluate(() => {
      const workspace = document.getElementById('home-files')?.getBoundingClientRect();
      const picker = document.querySelector('[data-home-picker]')?.getBoundingClientRect();
      const dock = document.querySelector('.home-dock')?.getBoundingClientRect();
      return {
        recentSectionDisplay: getComputedStyle(document.querySelector('[data-home-recents]')).display,
        recentListDisplay: getComputedStyle(document.querySelector('[data-home-recents] ul')).display,
        recentRects: [...document.querySelectorAll('#home-files li')].map((item) => {
          const rect = item.getBoundingClientRect();
          return `${Math.round(rect.left)}:${Math.round(rect.top)}`;
        }),
        workspaceBottom: workspace?.bottom ?? 0,
        pickerBottom: picker?.bottom ?? 0,
        dockTop: dock?.top ?? 0,
        dockBottom: dock?.bottom ?? 0,
        viewportHeight: innerHeight,
      };
    });

    expect(landing.recentSectionDisplay).not.toBe('contents');
    expect(landing.recentListDisplay).toBe('grid');
    expect(new Set(landing.recentRects).size).toBe(6);
    expect(landing.pickerBottom).toBeLessThanOrEqual(landing.dockTop + 1);
    expect(landing.workspaceBottom).toBeCloseTo(landing.dockTop, 0);
    expect(landing.dockBottom).toBeLessThanOrEqual(landing.viewportHeight + 1);
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

  test('places the demo in the right-hand portion of the scene before hydration', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // No JS runs (see test.use above), so this is the static markup CSS
    // alone. The demo track is a sibling *after* the dock in source order, so
    // mobile reads in the order it renders; on desktop the hero's own
    // full-bleed grid places it in the right-hand content column. Getting
    // that from named grid areas rather than source order is the whole point,
    // so this asserts the rendered position, not the DOM position.
    const placement = await page.evaluate(() => {
      const scene = document.querySelector('.home-hero');
      const demo = document.querySelector('[data-home-demo]');
      const sceneBox = scene?.getBoundingClientRect();
      const demoBox = demo?.getBoundingClientRect();
      return {
        sceneLeft: sceneBox?.left ?? 0,
        sceneWidth: sceneBox?.width ?? 0,
        demoLeft: demoBox?.left ?? 0,
      };
    });

    expect(placement.demoLeft).toBeGreaterThan(placement.sceneLeft + placement.sceneWidth * 0.4);
  });
});
