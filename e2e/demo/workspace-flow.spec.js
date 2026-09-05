import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { scrollStory, stageLocator } from './heroDemoHelpers.js';
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
  for (const [key, fraction, beat] of [['sign',.55,'fill-allergies'], ['sign',.81,'sign'], ['sign',.93,'share'], ['blur',.35,'blur'], ['blur',.5,'blackout'], ['blur',.64,'whiteout'], ['blur',.78,'delete']]) {
    await scrollStory(page,key,fraction);
    await expect.poll(() => stageLocator(page,key).evaluate((el,beat) => Number(el.style.getPropertyValue(`--p-${beat}`)),beat)).toBe(1);
  }
  const headings = await page.locator('#home-information h2').allTextContents();
  expect(headings).toEqual(['The tools I wanted, shared with everyone','Work survives restarts and crashes','Run PDkef offline as an app','Frequently asked questions','Open source & privacy']);
  // All cards use the document scroll; no hidden inner vertical scroll areas.
  expect(await page.locator('#home-information section').evaluateAll(elements => elements.every(el => !['auto','scroll'].includes(getComputedStyle(el).overflowY) && [...el.querySelectorAll('p,h2')].every(text => { const r = text.getBoundingClientRect(); return !r.height || r.bottom <= el.getBoundingClientRect().bottom + 1; })))).toBe(true);
  await page.locator('#try-workspace').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pdkef:tour-complete'))).toBe('yes');
  expect(await draftSnapshot(page)).toEqual(before);
  await page.keyboard.press('ControlOrMeta+Home');
  // Explicit top movement also covers browsers mapping that key differently.
  await page.evaluate(() => window.scrollTo(0,0));
  await expect(page.locator('html')).toHaveAttribute('data-home-mode','workspace');
  await expect(page.getByRole('button',{name:'Replay the demos'})).toBeVisible();
  expect(await draftSnapshot(page)).toEqual(before);
  await page.getByRole('button',{name:/Open bundled sample PDF/}).click();
  await expect(page).toHaveURL(/\/sign\/$/);
  await expect(page.locator('canvas').first()).toBeVisible({timeout:20000});
  await expect(page.getByText('PDkef bundled sample.pdf', {exact:true}).first()).toBeVisible();
  await expect.poll(() => draftSnapshot(page)).toEqual(expect.arrayContaining([expect.objectContaining({tool:'sign',fileName:'PDkef bundled sample.pdf'})]));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-home-mode','workspace');
  const recent = page.locator('.workspace-launcher a[href="/sign/"]');
  await expect(recent).toContainText('Bundled sample');
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
  }
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-home-mode','workspace');
  const icons = page.locator('.workspace-launcher li a');
  await expect(icons).toHaveCount(2);
  await expect(icons.filter({hasText:'my-sign-document.pdf'})).toContainText('Sign & Fill PDF');
  await expect(icons.filter({hasText:'my-redact-document.pdf'})).toContainText('Blur & Redact');
  const before = await draftSnapshot(page);
  await page.getByRole('button',{name:'Replay the demos'}).click();
  await scrollStory(page,'blur',1);
  expect(await draftSnapshot(page)).toEqual(before);
  await page.getByRole('button',{name:'Go to workspace'}).click();
  await icons.filter({hasText:'my-redact-document.pdf'}).dblclick();
  await expect(page).toHaveURL(/\/redact\/$/);
  await expect(page.locator('canvas').first()).toBeVisible();
});
