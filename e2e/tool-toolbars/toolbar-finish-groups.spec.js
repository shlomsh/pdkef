import { test, expect } from '@playwright/test';
import { makePdfBuffer as buildPdf } from '../support/pdf.js';
import { openTool as openSharedTool } from '../support/tool.js';

/* RED-73 (Shlomi, 2026-11-12): Redact's main toolbar wears Sign's strip finish.
   jsdom cannot see a ::before divider, a label's rect or a computed fill, so
   this runs in a real browser: which controls start a group (a 1px divider
   before them), where each word sits against its icon (beside from a 1280px
   window, under it at 1100px), one line at both, and that Find open and Peek
   held never borrow the armed tool's teal fill. */

const openTool = async (page, path, name) => {
  const buffer = await buildPdf(null, { title: false, lines: [{ text: 'Finish groups fixture' }] });
  await openSharedTool(page, path, { file: { name, buffer }, expectToolbar: true });
};

// Same stub as toolbar-desktop-one-line.spec.js, before any page script runs.
async function stubSharePresent(page) {
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async () => {};
  });
}

const VIEWPORTS = [{ width: 1280, height: 900 }, { width: 1100, height: 900 }];

// The direct toolbar children that have a 1px divider before them, by name.
async function dividerNames(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-editor-toolbar]');
    const nameOf = (el) => {
      const text = el.getAttribute('aria-label') ?? el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? el.textContent ?? '';
      return text.trim();
    };
    return [...toolbar.children].filter((el) => {
      const before = getComputedStyle(el, '::before');
      return before.content !== 'none' && before.width === '1px';
    }).map(nameOf);
  });
}

const canon = (names) => names.map((n) => (/^more/i.test(n) ? 'More' : /^undo/i.test(n) ? 'Undo' : /^find/i.test(n) ? 'Find' : /^share/i.test(n) ? 'Share' : /^download/i.test(n) ? 'Download' : n));

const tools = [
  { name: 'Sign', path: '/sign/?next=0', fixture: 'sign-groups.pdf', starts: ['More', 'Undo'] },
  { name: 'Redact', path: '/redact', fixture: 'redact-groups.pdf', starts: ['Find', 'Undo'] },
];

for (const tool of tools) {
  for (const viewport of VIEWPORTS) {
    test(`${tool.name} at ${viewport.width}px: dividers sit before ${tool.starts.join(', ')} and the export group`, async ({ page }) => {
      await stubSharePresent(page);
      await page.setViewportSize(viewport);
      await openTool(page, tool.path, tool.fixture);
      expect(canon(await dividerNames(page))).toEqual([...tool.starts, 'Share']);
    });

    test(`${tool.name} at ${viewport.width}px without Share: the export group starts at Download`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openTool(page, tool.path, tool.fixture);
      expect(canon(await dividerNames(page))).toEqual([...tool.starts, 'Download']);
    });
  }
}

// Where a word sits against its icon, measured on real rects.
async function placement(page, word) {
  return page.evaluate((w) => {
    const toolbar = document.querySelector('[data-editor-toolbar]');
    const button = [...toolbar.querySelectorAll('button')].find((b) => [...b.querySelectorAll('span')].some((s) => s.textContent?.trim() === w));
    if (!button) return null;
    const label = [...button.querySelectorAll('span')].find((s) => s.textContent?.trim() === w).getBoundingClientRect();
    const icon = button.querySelector('svg').getBoundingClientRect();
    return {
      beside: label.left >= icon.right - 1 && Math.abs((label.top + label.height / 2) - (icon.top + icon.height / 2)) <= 2,
      under: label.top >= icon.bottom - 1,
      label: label.width,
    };
  }, word);
}

const WORDS = ['Blur', 'Blackout', 'Whiteout', 'Delete', 'Find', 'Peek'];

async function oneLine(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-editor-toolbar]');
    const centres = [...toolbar.children].filter((el) => getComputedStyle(el).display !== 'none').map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    return Math.max(...centres) - Math.min(...centres);
  });
}

for (const viewport of VIEWPORTS) {
  test(`Redact at ${viewport.width}px: words ${viewport.width >= 1280 ? 'beside' : 'under'} their icons, Undo and Redo icon-only, one line`, async ({ page }) => {
    await stubSharePresent(page);
    await page.setViewportSize(viewport);
    await openTool(page, '/redact', 'redact-groups-words.pdf');
    const beside = viewport.width >= 1280;
    for (const word of WORDS) {
      const p = await placement(page, word);
      expect(p, `${word} button exists`).not.toBeNull();
      expect(beside ? p.beside : p.under, `${word} at ${viewport.width}px: ${JSON.stringify(p)}`).toBe(true);
    }
    for (const word of ['Undo', 'Redo']) {
      const p = await placement(page, word);
      expect(p.label, `${word} shows no visible word`).toBeLessThanOrEqual(2);
    }
    expect(await oneLine(page), 'control centres within 1px').toBeLessThanOrEqual(1);
  });
}

test('Redact: Find open and Peek held are not the armed teal fill', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTool(page, '/redact', 'redact-groups-armed.pdf');
  const toolbar = page.locator('[data-editor-toolbar]');
  // A fill transitions in, so read it once two reads 150ms apart agree.
  const fill = async (locator) => {
    const read = () => locator.evaluate((el) => getComputedStyle(el).backgroundColor);
    let last = await read();
    for (let i = 0; i < 20; i += 1) {
      await page.waitForTimeout(150);
      const next = await read();
      if (next === last) return next;
      last = next;
    }
    return last;
  };

  const blackout = toolbar.getByRole('button', { name: 'Blackout', exact: true });
  await blackout.click();
  await expect(blackout).toHaveAttribute('aria-pressed', 'true');
  const armed = await fill(blackout);
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);

  const find = toolbar.locator('[data-redact-find-toggle]');
  await find.click();
  await expect(find).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  expect(await fill(find), 'Find open is not the armed fill').not.toBe(armed);

  const peek = toolbar.locator('[data-redact-peek]');
  const box = await peek.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(peek).toHaveAttribute('aria-pressed', 'true');
  expect(await fill(peek), 'Peek held is not the armed fill').not.toBe(armed);
  await page.mouse.up();
});
