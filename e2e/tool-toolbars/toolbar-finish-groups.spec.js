import { test, expect } from '@playwright/test';
import { makePdfBuffer as buildPdf } from '../support/pdf.js';
import { openTool as openSharedTool, waitForIsland } from '../support/tool.js';

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
    let last = null;
    await expect.poll(async () => {
      const next = await locator.evaluate((el) => getComputedStyle(el).backgroundColor);
      const settled = next === last;
      last = next;
      return settled;
    }, { intervals: [150], timeout: 3000 }).toBe(true);
    return last;
  };

  const blackout = toolbar.getByRole('button', { name: 'Blackout', exact: true });
  await blackout.click();
  await expect(blackout).toHaveAttribute('aria-pressed', 'true');
  const armed = await fill(blackout);
  const soft = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.background = 'var(--color-primary-soft)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);

  const find = toolbar.locator('[data-redact-find-toggle]');
  await find.click();
  await expect(find).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  const findFill = await fill(find);
  expect(findFill, 'Find open is not the armed fill').not.toBe(armed);
  expect(findFill, 'Find open takes the tinted ground').toBe(soft);

  const peek = toolbar.locator('[data-redact-peek]');
  const box = await peek.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(peek).toHaveAttribute('aria-pressed', 'true');
  const peekFill = await fill(peek);
  expect(peekFill, 'Peek held is not the armed fill').not.toBe(armed);
  expect(peekFill, 'Peek held takes the tinted ground').toBe(soft);
  await page.mouse.up();
});

/* With Drive connected, Download and its arrow read as one outlined control in both
   label states. Signing in to Drive is not possible here, so a stand-in arrow with the
   hook the finish styles (`data-drive-arrow`) goes right after Download. */
for (const viewport of VIEWPORTS) {
  test(`Redact at ${viewport.width}px: the Drive arrow joins Download at its full height`, async ({ page }) => {
    await stubSharePresent(page);
    await page.setViewportSize(viewport);
    await openTool(page, '/redact', 'redact-groups-drive.pdf');
    const join = await page.evaluate(() => {
      const toolbar = document.querySelector('[data-editor-toolbar]');
      const download = [...toolbar.children].find((el) => /download/i.test(el.textContent ?? ''));
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.setAttribute('data-drive-arrow', '');
      arrow.setAttribute('aria-label', 'Save to Google Drive');
      download.after(arrow);
      const d = download.getBoundingClientRect();
      const a = arrow.getBoundingClientRect();
      return { top: Math.abs(a.top - d.top), bottom: Math.abs(a.bottom - d.bottom), gap: a.left - d.right };
    });
    expect(join.top, JSON.stringify(join)).toBeLessThanOrEqual(1);
    expect(join.bottom, JSON.stringify(join)).toBeLessThanOrEqual(1);
    expect(Math.abs(join.gap), JSON.stringify(join)).toBeLessThanOrEqual(2);
    expect(await oneLine(page), 'control centres within 1px').toBeLessThanOrEqual(1);
  });
}

/* SIGN-51: from 920px up, Download (and a Drive arrow joined to it) is outlined in a 1.5px
   --color-border-strong frame. Chromium floors a border's width to whole CSS pixels, so the
   frame is a 1px border plus a 0.5px inset ring, as READ-28 does for Highlight's tile. With
   the arrow, each side of the pair carries the ring on its outer sides only. */

// Resolves a CSS custom property to the rgb string a computed style reports.
const token = (page, name) => page.evaluate((n) => {
  const probe = document.createElement('div');
  probe.style.background = `var(${n})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return colour;
}, name);

// The sides an inset ring paints, read from the computed box-shadow, with each ring's colour.
async function frame(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const rings = [...cs.boxShadow.matchAll(/(rgba?\([^)]*\)) (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px inset/g)].map(([, colour, x, y, , spread]) => ({ colour, x: +x, y: +y, spread: +spread }));
    const sides = new Set();
    for (const r of rings) {
      if (r.spread > 0) ['top', 'right', 'bottom', 'left'].forEach((s) => sides.add(s));
      if (r.x > 0) sides.add('left');
      if (r.x < 0) sides.add('right');
      if (r.y > 0) sides.add('top');
      if (r.y < 0) sides.add('bottom');
    }
    const widths = rings.map((r) => Math.max(Math.abs(r.x), Math.abs(r.y), r.spread));
    return {
      border: { top: cs.borderTopWidth, right: cs.borderRightWidth, bottom: cs.borderBottomWidth, left: cs.borderLeftWidth },
      borderColour: cs.borderTopColor,
      ringColours: [...new Set(rings.map((r) => r.colour))],
      ringWidths: [...new Set(widths)],
      sides: [...sides].sort(),
    };
  });
}

const OUTLINE_TOOLS = [
  { name: 'Sign', path: '/sign/?next=0', start: 'left', end: 'right' },
  { name: 'Redact', path: '/redact', start: 'left', end: 'right' },
  { name: 'Sign right to left', path: '/he/sign/?next=0', start: 'right', end: 'left' },
];

// Opens by the file button in either language, since the shared opener reads the English word.
async function openAnyLanguage(page, path) {
  await page.goto(path);
  await waitForIsland(page);
  const buffer = await buildPdf(null, { title: false, lines: [{ text: 'Outline fixture' }] });
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-tool-shell], main').getByText(/Choose file|בחירת קובץ/).first().click();
  await (await chooser).setFiles({ name: 'outline.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.locator('[data-editor-toolbar]')).toBeVisible();
}

// A 1px border plus a 0.5px ring, both in `colour`, the ring on `sides` only.
async function expectFrame(locator, colour, sides, what) {
  // Colours ease in (border-color transitions); the frame is read once the border has settled.
  await expect.poll(async () => (await frame(locator)).borderColour, { message: what, timeout: 3000 }).toBe(colour);
  const f = await frame(locator);
  const detail = `${what}: ${JSON.stringify(f)}`;
  for (const side of sides) expect(f.border[side], detail).toBe('1px');
  expect(f.borderColour, detail).toBe(colour);
  expect(f.ringColours, detail).toEqual([colour]);
  expect(f.ringWidths, detail).toEqual([0.5]);
  expect(f.sides, detail).toEqual([...sides].sort());
}

for (const tool of OUTLINE_TOOLS) {
  test(`${tool.name} at 1280px: Download is a 1px border plus a 0.5px ring in the strong token, shared with a Drive arrow`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openAnyLanguage(page, tool.path);
    const strong = await token(page, '--color-border-strong');
    const border = await token(page, '--color-border');
    const download = page.locator('[data-editor-toolbar] > [class*="_download_"]');
    const all = ['top', 'right', 'bottom', 'left'];
    // Redact's Download waits for a first mark; the frame is read in both states by toggling it.
    const setDisabled = (value) => download.evaluate((el, v) => { el.disabled = v; }, value);

    await setDisabled(true);
    await expectFrame(download, border, all, 'disabled Download');
    await setDisabled(false);
    await expectFrame(download, strong, all, 'Download');

    // The real arrow class from DriveSaveMenu.module.css, found in the loaded sheets, so its own
    // `.arrow.arrow.arrow.arrow` rules take part in the cascade, as with a connected Drive.
    await page.evaluate(() => {
      const toolbar = document.querySelector('[data-editor-toolbar]');
      const dl = [...toolbar.children].find((el) => /(^| )_download_/.test(el.className));
      const arrowClass = [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } })
        .map((rule) => rule.selectorText?.match(/^\.(_arrow_[\w-]+)\.\1\.\1\.\1$/)?.[1]).find(Boolean);
      if (!arrowClass) throw new Error('DriveSaveMenu arrow class not found in the page sheets');
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = arrowClass;
      arrow.setAttribute('data-drive-arrow', '');
      arrow.setAttribute('aria-label', 'Save to Google Drive');
      dl.after(arrow);
    });
    const arrow = page.locator('[data-editor-toolbar] > [data-drive-arrow]');
    const seamColour = () => arrow.evaluate((el, s) => getComputedStyle(el)[`border${s[0].toUpperCase()}${s.slice(1)}Color`], tool.start);

    // Each half rings its outer sides, never the seam; the seam is the arrow's quiet 1px divider.
    expect((await frame(download)).border[tool.end], 'Download gives up its seam border').toBe('0px');
    await expectFrame(download, strong, ['top', 'bottom', tool.start], 'Download joined');
    expect((await frame(arrow)).border).toEqual({ top: '1px', right: '1px', bottom: '1px', left: '1px' });
    await expectFrame(arrow, strong, ['top', 'bottom', tool.end], 'arrow');
    expect(await seamColour(), 'the seam is the quiet divider').toBe(border);

    await setDisabled(true);
    await expectFrame(download, border, ['top', 'bottom', tool.start], 'disabled Download joined');
    await expectFrame(arrow, border, ['top', 'bottom', tool.end], 'arrow beside a disabled Download');
  });
}
