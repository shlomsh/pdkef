import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { scrollStory, stageLocator } from './heroDemoHelpers.js';
import { SAMPLE_FILE_NAME } from '../../src/components/sampleDocument.ts';
test.use({serviceWorkers:'block'});

async function draftSnapshot(page) {
  return page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    if (!dbs.some(db => db.name === 'pdf-toolkit-workspace')) return [];
    return new Promise(resolve => {
      const request = indexedDB.open('pdf-toolkit-workspace');
      request.onsuccess = () => {
        const db = request.result;
        const records = db.transaction('workspace').objectStore('workspace').getAll();
        records.onsuccess = () => { resolve(records.result.map(({tool, fileName, savedAt}) => ({tool,fileName,savedAt}))); db.close(); };
      };
    });
  });
}

test('complete stories, information, session handoff, and real bundled sample entry', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const before = await draftSnapshot(page);
  await expect(page.locator('#home-files').getByRole('button',{name:/Open bundled sample PDF/})).toContainText(SAMPLE_FILE_NAME);
  await expect(page.locator('#home-files img[src="/images/redaction-guide/sample-preview.jpg"]')).toBeVisible();
  for (const [key, fraction, beat] of [['sign',.55,'fill-allergies'], ['sign',.81,'sign'], ['sign',.93,'share'], ['blur',.37,'blur'], ['blur',.5,'blackout'], ['blur',.64,'whiteout'], ['blur',.78,'delete']]) {
    await scrollStory(page,key,fraction);
    await expect.poll(() => stageLocator(page,key).evaluate((el,beat) => Number(el.style.getPropertyValue(`--p-${beat}`)),beat)).toBe(1);
  }
  // The closing "Give it a try" stage participates in the same card system
  // as the information cards, so it has the shared reveal, pattern, and
  // scroll-linked depth treatment as it arrives below the final story card.
  const headings = await page.locator('#home-information .card-reveal h2').allTextContents();
  expect(headings).toEqual(['Simple PDF tools, made to share','Close the tab. Keep your progress.','Your PDF tools, even offline','Frequently asked questions','Private by design. Open to inspect.','Give it a try.']);
  // All cards use the document scroll; no hidden inner vertical scroll areas.
  expect(await page.locator('#home-information section').evaluateAll(elements => elements.every(el => !['auto','scroll'].includes(getComputedStyle(el).overflowY) && [...el.querySelectorAll('p,h2')].every(text => { const r = text.getBoundingClientRect(); return !r.height || r.bottom <= el.getBoundingClientRect().bottom + 1; })))).toBe(true);
  await page.locator('#try-workspace').scrollIntoViewIfNeeded();
  expect(await draftSnapshot(page)).toEqual(before);
  await page.keyboard.press('ControlOrMeta+Home');
  // Explicit top movement also covers browsers mapping that key differently.
  await page.evaluate(() => window.scrollTo(0,0));
  expect(await draftSnapshot(page)).toEqual(before);
  await page.locator('#try-workspace').getByRole('button',{name:/PDkef practice form\.pdf/}).click();
  await expect(page).toHaveURL(/\/sign\/$/);
  await expect(page.locator('canvas').first()).toBeVisible({timeout:20000});
  await expect(page.getByText(SAMPLE_FILE_NAME, {exact:true}).first()).toBeVisible();
  await expect.poll(() => draftSnapshot(page)).toEqual(expect.arrayContaining([expect.objectContaining({tool:'sign',fileName:SAMPLE_FILE_NAME})]));
  await page.goto('/');
  const recent = page.locator('.workspace-launcher button[aria-label^="Open recent PDF"]');
  await expect(recent).toContainText(SAMPLE_FILE_NAME);
  await expect(recent).not.toContainText('Bundled sample');
  await recent.click();
  await expect(page).toHaveURL(/\/sign\/$/);
  expect(errors).toEqual([]);
});

test('the complete form fits above the dock on a laptop and iPhone-sized viewport', async ({ page }) => {
  for (const viewport of [{width:1280,height:720},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await scrollStory(page,'sign',.81);
    const stage = stageLocator(page,'sign');
    const screen = await stage.locator('[class*="_screen_"]').boundingBox();
    const date = await stage.locator('[class*="_date-line_"]').boundingBox();
    expect(date.y + date.height).toBeLessThanOrEqual(screen.y + screen.height + 1);
    await scrollStory(page,'blur',.74);
    const bill = stageLocator(page,'blur');
    const billScreen = await bill.locator('[class*="_screen_"]').boundingBox();
    const billEnd = await bill.locator('[class*="_doc-line_"]').last().boundingBox();
    expect(billEnd.y + billEnd.height).toBeLessThanOrEqual(billScreen.y + billScreen.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      await expect(stage.locator('[class*="_phone_"]')).toHaveCSS('box-shadow','none');
      const dock = page.locator('.home-dock');
      expect(await dock.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    }
  }
});


test('the same source PDF is deduplicated to its latest tool and opens from the desktop launcher', async ({ page }) => {
  const bytes = readFileSync('public/images/redaction-guide/sample.pdf');
  for (const tool of ['sign','redact']) {
    await page.goto(`/${tool}/`);
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await page.locator('input[type="file"]').first().setInputFiles({name:`my-${tool}-document.pdf`,mimeType:'application/pdf',buffer:bytes});
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect.poll(() => draftSnapshot(page)).toEqual(expect.arrayContaining([expect.objectContaining({tool,fileName:`my-${tool}-document.pdf`})]));
    await expect.poll(() => page.evaluate(tool => JSON.parse(localStorage.getItem('pdf-toolkit:workspace:draft-meta:' + tool))?.preview, tool)).toMatch(/^data:image/);
  }
  // Simulate an older saved draft whose thumbnail lost the autosave race.
  const savedAt = await page.evaluate(() => {
    const key = 'pdf-toolkit:workspace:draft-meta:sign';
    const meta = JSON.parse(localStorage.getItem(key));
    delete meta.preview;
    localStorage.setItem(key, JSON.stringify(meta));
    return meta.savedAt;
  });
  await page.goto('/');
  const icons = page.locator('.workspace-launcher li button[aria-label^="Open recent PDF"]');
  // Both editor visits use the same sample bytes. The recent-files cache is
  // content-addressed, so one source stays one launcher card and its latest
  // tool is the natural resume destination.
  await expect(icons).toHaveCount(1);
  await expect(icons).toContainText('my-redact-document.pdf');
  await expect(icons).toContainText('Blur & Redact');
  for (const icon of await icons.all()) {
    await expect(icon.locator('img')).toBeVisible();
    await expect(icon).toContainText('just now');
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdf-toolkit:workspace:draft-meta:sign')).savedAt)).toBe(savedAt);
  const before = await draftSnapshot(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await scrollStory(page,'blur',1);
  expect(await draftSnapshot(page)).toEqual(before);
  await page.evaluate(() => window.scrollTo(0,0));
  await icons.click();
  await expect(page).toHaveURL(/\/redact\/$/);
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('mobile always shows the file workspace before the live demo', async ({ page }) => {
  // 767px is the upper edge of the single-column mobile layout. This guards
  // the breakpoint where the workspace used to get moved inside the tour,
  // after the demo, despite the mobile layout still being active.
  await page.setViewportSize({ width: 767, height: 844 });
  await page.goto('/');
  const order = () => page.evaluate(() => {
    const hero = document.querySelector('.home-hero');
    // Not #home-tour: it now wraps the whole page (hero included), so "dock
    // before tour" is no longer a meaningful DOM-order relationship - dock
    // is checked below against the demo track instead, which is the region
    // this guard originally cared about the workspace/dock not sliding into.
    const demoTrack = document.querySelector('.demo-track[data-demo-track="mobile"]');
    const files = document.getElementById('home-files');
    const dock = document.querySelector('.home-dock');
    return {
      heroContainsFiles: hero?.contains(files) ?? false,
      filesFirst: !!(files.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING),
      dockOutsideDemo: Boolean(dock && demoTrack && !demoTrack.contains(dock)),
    };
  });
  await expect.poll(order).toEqual({ heroContainsFiles: true, filesFirst: true, dockOutsideDemo: true });
  await expect(page.locator('#home-files [data-home-picker]')).toBeInViewport();
  await scrollStory(page, 'sign', .81);
  const stage = stageLocator(page, 'sign');
  const screen = await stage.locator('[class*="_screen_"]').boundingBox();
  const date = await stage.locator('[class*="_date-line_"]').boundingBox();
  expect(date.y + date.height).toBeLessThanOrEqual(screen.y + screen.height + 1);
  await page.locator('#try-workspace').scrollIntoViewIfNeeded();
  await expect.poll(order).toEqual({ heroContainsFiles: true, filesFirst: true, dockOutsideDemo: true });
  // This half of the test wants a *fresh load at the top*, and the line above
  // has just scrolled to the closing card near the end of a ~14,000px page.
  // Scroll restoration would put the reload back there and win the race
  // against the scrollTo below, leaving the picker legitimately offscreen and
  // failing the viewport assertion for a reason that has nothing to do with
  // what this guard is about. It used to pass by accident: the old
  // arrangeWorkspace() re-parenting changed layout during load, which was
  // enough to defeat restoration. Removing that made restoration reliable, so
  // the precondition now has to be stated rather than assumed.
  await page.evaluate(() => { history.scrollRestoration = 'manual'; });
  await page.reload();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
  await expect.poll(order).toEqual({ heroContainsFiles: true, filesFirst: true, dockOutsideDemo: true });
  await expect(page.locator('#home-files [data-home-picker]')).toBeInViewport();
  await scrollStory(page, 'blur', .64);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.home-scene > #home-files')).toHaveCount(1);
  await scrollStory(page, 'sign', .81);
});

test('desktop keeps one compact launcher and live demo after completion', async ({ page }) => {
  await page.goto('/');
  const picker = page.locator('#home-files [data-home-picker]');
  const initial = await picker.boundingBox();
  await page.locator('#try-workspace').scrollIntoViewIfNeeded();
  await page.locator('[data-workspace-return]').click();
  const returned = await picker.boundingBox();
  expect(returned.width).toBe(initial.width);
  expect(returned.height).toBe(initial.height);
  expect(returned.x).toBe(initial.x);
  await scrollStory(page, 'blur', .64);
  await page.reload();
  await scrollStory(page, 'sign', .81);
});
