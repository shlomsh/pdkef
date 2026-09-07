import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { scrollStory, stageLocator } from './heroDemoHelpers.js';
import { SAMPLE_FILE_NAME } from '../../src/components/sampleDocument.ts';
test.use({serviceWorkers:'block'});

async function draftSnapshot(page) {
  return page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    if (!dbs.some(db => db.name === 'pdf-toolkit-drafts')) return [];
    return new Promise(resolve => {
      const request = indexedDB.open('pdf-toolkit-drafts');
      request.onsuccess = () => {
        const db = request.result;
        const records = db.transaction('drafts').objectStore('drafts').getAll();
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
  const recent = page.locator('.workspace-launcher a[href="/sign/"]');
  await expect(recent).toContainText(SAMPLE_FILE_NAME);
  await expect(recent).not.toContainText('Bundled sample');
  await recent.click();
  await expect(page).toHaveURL(/\/$/);
  await recent.press('Enter');
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


test('returning users get exactly one Sign and one Redact icon with desktop opening', async ({ page }) => {
  const bytes = readFileSync('public/images/redaction-guide/sample.pdf');
  for (const tool of ['sign','redact']) {
    await page.goto(`/${tool}/`);
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await page.locator('input[type="file"]').first().setInputFiles({name:`my-${tool}-document.pdf`,mimeType:'application/pdf',buffer:bytes});
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect.poll(() => draftSnapshot(page)).toEqual(expect.arrayContaining([expect.objectContaining({tool,fileName:`my-${tool}-document.pdf`})]));
    await expect.poll(() => page.evaluate(tool => JSON.parse(localStorage.getItem('pdf-toolkit:draft-meta:' + tool))?.preview, tool)).toMatch(/^data:image/);
  }
  // Simulate an older saved draft whose thumbnail lost the autosave race.
  const savedAt = await page.evaluate(() => {
    const key = 'pdf-toolkit:draft-meta:sign';
    const meta = JSON.parse(localStorage.getItem(key));
    delete meta.preview;
    localStorage.setItem(key, JSON.stringify(meta));
    return meta.savedAt;
  });
  await page.goto('/');
  const icons = page.locator('.workspace-launcher li a');
  await expect(icons).toHaveCount(2);
  await expect(icons.filter({hasText:'my-sign-document.pdf'})).toContainText('Sign & Fill PDF');
  await expect(icons.filter({hasText:'my-redact-document.pdf'})).toContainText('Blur & Redact');
  for (const icon of await icons.all()) {
    await expect(icon.locator('img')).toBeVisible();
    await expect(icon).toContainText('just now');
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdf-toolkit:draft-meta:sign')).savedAt)).toBe(savedAt);
  const before = await draftSnapshot(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await scrollStory(page,'blur',1);
  expect(await draftSnapshot(page)).toEqual(before);
  await page.evaluate(() => window.scrollTo(0,0));
  await icons.filter({hasText:'my-redact-document.pdf'}).dblclick();
  await expect(page).toHaveURL(/\/redact\/$/);
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('mobile always shows the file workspace before the live demo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const order = () => page.evaluate(() => {
    const tour = document.getElementById('home-tour');
    const files = document.getElementById('home-files');
    return { sameParent: tour.parentElement === files.parentElement, filesFirst: !!(files.compareDocumentPosition(tour) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  await expect.poll(order).toEqual({ sameParent: true, filesFirst: true });
  await expect(page.locator('#home-files [data-home-picker]')).toBeInViewport();
  await scrollStory(page, 'sign', .81);
  const stage = stageLocator(page, 'sign');
  const screen = await stage.locator('[class*="_screen_"]').boundingBox();
  const date = await stage.locator('[class*="_date-line_"]').boundingBox();
  expect(date.y + date.height).toBeLessThanOrEqual(screen.y + screen.height + 1);
  await page.locator('#try-workspace').scrollIntoViewIfNeeded();
  await expect.poll(order).toEqual({ sameParent: true, filesFirst: true });
  await page.reload();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(order).toEqual({ sameParent: true, filesFirst: true });
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
