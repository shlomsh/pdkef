#!/usr/bin/env node
// SCAN-01: regenerates the illustrated images on /scan-to-pdf/ (public/images/scan-guide/*.jpg) by
// running the REAL Scan to PDF tool on one sample photo, so every picture shows what the tool does.
//
// What it makes (all JPEG, progressive, under ~120 KB):
//   photo.jpg                          900x1200  the sample photo (a synthetic phone shot of a form on a table)
//   scan.jpg                           900x1200  Document + Fit result, centred on a neutral ground (pairs with photo.jpg)
//   look-original/grayscale/document   600x800   the three looks, Fit pages
//   size-fit/a4/letter                 600x800   Document look, the whole PDF page as a bordered sheet
//   limit-none / limit-500kb           600x400   same 100%-zoom crop of Document + A4 with no limit and with 500 KB
//
// From what: a deterministic sample photo drawn with Python PIL (python3 + Pillow), then the built site
// served from a directory with a production build, driven in Chromium via Playwright; PDFs are
// rasterized with pdftoppm (poppler). PDF byte sizes are printed at the end.
//
// Re-run after a tool change (build first so the served dist/ is current):
//   npm run build
//   node scripts/generate-scan-examples.mjs [--dist dist] [--crop 100,1900]
// --dist is the directory to serve (default dist/); --crop is the x,y of the limit-*.jpg crop in the
// 200 dpi A4 raster. The script starts and stops its own static server on port 4533.
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const dist = resolve(arg('--dist', join(root, 'dist')));
const crop = arg('--crop', '100,1900').split(',').map(Number);
const outdir = join(root, 'public/images/scan-guide');
const PORT = 4533;
const work = mkdtempSync(join(tmpdir(), 'scan-examples-'));
mkdirSync(outdir, { recursive: true });

const PHOTO_PY = String.raw`import sys, json, random, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

OUT_FULL, OUT_SMALL, CORNERS_JSON = sys.argv[1:4]
random.seed(7)
W, H = 3024, 4032
PW, PH = 1700, 2200

def font(path, size, idx=0):
    return ImageFont.truetype(path, size, index=idx)
SUP = '/System/Library/Fonts/Supplemental/'
ARIAL = SUP + 'Arial.ttf'
ARIALB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
HAND = SUP + 'Bradley Hand Bold.ttf'

# ---------- the paper, flat ----------
paper = Image.new('RGB', (PW, PH), (247, 244, 237))
d = ImageDraw.Draw(paper)
ink = (38, 38, 42)
blue = (28, 44, 128)
# logo mark: circle with an open book
d.ellipse((140, 130, 270, 260), fill=(34, 74, 120))
d.polygon([(165, 205), (205, 190), (205, 230), (165, 240)], fill=(247, 244, 237))
d.polygon([(245, 205), (205, 190), (205, 230), (245, 240)], fill=(225, 230, 235))
d.text((300, 135), 'Maple Street Library', font=font(ARIALB, 46), fill=(34, 74, 120))
d.text((300, 195), 'Member services', font=font(ARIAL, 34), fill=(110, 110, 115))
d.text((140, 350), 'Library card application', font=font(ARIALB, 86), fill=ink)
d.line((140, 470, PW - 140, 470), fill=(34, 74, 120), width=5)
fields = [('Full name', 'Alex Rivera'), ('Date of birth', '14 / 03 / 1991'),
          ('Street address', '27 Alder Lane, Apt 4B'), ('City and postcode', 'Northfield  10231'),
          ('Phone', '555 0142 987'), ('Email', 'alex.rivera@example.com'),
          ('Occupation', 'Graphic designer')]
y = 540
lab = font(ARIAL, 34); val = font(HAND, 62)
for label, value in fields:
    d.text((140, y), label.upper(), font=font(ARIAL, 28), fill=(105, 105, 110))
    d.line((140, y + 128, PW - 140, y + 128), fill=(90, 90, 95), width=3)
    d.text((165 + random.randint(0, 8), y + 46 + random.randint(-3, 3)), value, font=val, fill=blue)
    y += 165
# checkbox row
d.text((140, y + 10), 'CARD TYPE', font=font(ARIAL, 28), fill=(105, 105, 110))
x = 140
for i, name in enumerate(['Adult', 'Student', 'Senior', 'Child']):
    bx = x
    d.rectangle((bx, y + 70, bx + 54, y + 124), outline=ink, width=4)
    d.text((bx + 76, y + 76), name, font=font(ARIAL, 40), fill=ink)
    if i == 0:
        d.line((bx + 8, y + 98, bx + 24, y + 116), fill=blue, width=8)
        d.line((bx + 24, y + 116, bx + 62, y + 52), fill=blue, width=8)
    x += 385
y += 210
# signature
d.text((140, y), 'SIGNATURE', font=font(ARIAL, 28), fill=(105, 105, 110))
d.line((140, y + 150, 900, y + 150), fill=(90, 90, 95), width=3)
pts = []
for t in range(0, 220):
    u = t / 219
    px = 175 + u * 650
    py = y + 95 + 38 * math.sin(u * 17) * (1 - 0.4 * u) - 25 * math.sin(u * 6.3)
    pts.append((px, py))
d.line(pts, fill=blue, width=6, joint='curve')
d.line([(300, y + 135), (820, y + 118)], fill=blue, width=4)
d.text((1000, y + 110), 'Date', font=font(ARIAL, 28), fill=(105, 105, 110))
d.line((1090, y + 150, PW - 140, y + 150), fill=(90, 90, 95), width=3)
d.text((1120, y + 90), '26 Oct 2026', font=font(HAND, 54), fill=blue)
d.text((140, PH - 120), 'Please bring a photo ID to your first visit. Maple Street Library, open daily 9 to 6.',
       font=font(ARIAL, 27), fill=(120, 120, 125))
# paper grain
grain = Image.effect_noise((PW, PH), 14).convert('RGB')
paper = ImageChops.add(paper, grain, 1, -128)

# ---------- the table ----------
table = Image.new('RGB', (W, H), (74, 48, 30))
td = ImageDraw.Draw(table)
for yy in range(0, H, 3):
    k = random.randint(-14, 14) + int(10 * math.sin(yy / 41.0))
    td.line((0, yy, W, yy), fill=(74 + k, 48 + k * 2 // 3, 30 + k // 2), width=3)
for _ in range(90):  # grain streaks
    yy = random.randint(0, H); x0 = random.randint(-500, W); L = random.randint(300, 1600)
    k = random.randint(-22, 14)
    td.line((x0, yy, x0 + L, yy + random.randint(-6, 6)), fill=(66 + k, 42 + k, 26 + k), width=random.randint(1, 4))
for px in (1150, 2100):  # plank seams
    td.line((0, 0, 0, 0))
for yy in (1330, 2700):
    td.line((0, yy, W, yy + 8), fill=(30, 18, 10), width=6)
table = table.filter(ImageFilter.GaussianBlur(2.2))

# ---------- perspective ----------
dst = [(520, 520), (2440, 360), (2700, 3470), (400, 3680)]  # TL TR BR BL in photo px
src = [(0, 0), (PW, 0), (PW, PH), (0, PH)]

def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c])); M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [a - f * bb for a, bb in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]

def coeffs(out_pts, in_pts):  # PIL wants output->input
    A, b = [], []
    for (x, y), (u, v) in zip(out_pts, in_pts):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return solve(A, b)

c = coeffs(dst, src)
warped = paper.transform((W, H), Image.PERSPECTIVE, c, Image.BICUBIC)
mask = Image.new('L', (PW, PH), 255).transform((W, H), Image.PERSPECTIVE, c, Image.BILINEAR)

# uneven warm light: darker, warm shadow band across the left/bottom
light = Image.new('RGB', (W, H))
ld = ImageDraw.Draw(light)
for xx in range(W):
    t = xx / W
    v = 1.0 - 0.34 * max(0.0, 1 - t / 0.62) ** 1.4
    ld.line((xx, 0, xx, H), fill=(int(255 * v), int(246 * v * (0.97 + 0.03 * t)), int(228 * v * (0.9 + 0.1 * t))))
for yy in range(H):  # slight vertical falloff
    pass
vig = Image.new('L', (W, H), 0)
ImageDraw.Draw(vig).ellipse((-500, -400, W + 500, H + 400), fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(500))
light = ImageChops.multiply(light, Image.merge('RGB', (vig.point(lambda p: 170 + p * 85 // 255),) * 3))

# drop shadow
sh = mask.filter(ImageFilter.GaussianBlur(34))
sh = ImageChops.offset(sh, 34, 52).point(lambda p: p * 62 // 100)
photo = Image.composite(Image.new('RGB', (W, H), (12, 8, 5)), table, sh)
# thin darker paper edge, then paper
photo.paste(warped, (0, 0), mask)
photo = ImageChops.multiply(photo, light)
photo = photo.filter(ImageFilter.GaussianBlur(1.7))
photo = ImageChops.add(photo, Image.effect_noise((W, H), 17).convert('RGB'), 1, -128)
photo.save(OUT_FULL, 'JPEG', quality=92)
small = photo.resize((900, 1200), Image.LANCZOS)
import os
for q in (82, 76, 70, 64, 58, 52):
    small.save(OUT_SMALL, 'JPEG', quality=q, optimize=True, progressive=True)
    if os.path.getsize(OUT_SMALL) <= 120_000: break
json.dump({'corners': [[x / W, y / H] for x, y in dst], 'size': [W, H]}, open(CORNERS_JSON, 'w'))
`;
const POST_PY = String.raw`
import sys, os, json
from PIL import Image, ImageDraw
work, outdir = sys.argv[1:3]
BG = (236, 235, 232)
CROP = json.loads(sys.argv[3])  # [x, y] top-left of the 600x400 crop at -r 200
def jpg(im, name):
    path = os.path.join(outdir, name)
    for q in (82, 78, 74, 70, 66, 62):
        im.save(path, 'JPEG', quality=q, optimize=True, progressive=True)
        if os.path.getsize(path) <= 120_000: break
def sheet(png, box, margin, border=True):
    im = Image.open(png).convert('RGB')
    bw, bh = box
    s = min((bw - 2 * margin) / im.width, (bh - 2 * margin) / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    canvas = Image.new('RGB', box, BG)
    x, y = (bw - im.width) // 2, (bh - im.height) // 2
    canvas.paste(im, (x, y))
    if border:
        ImageDraw.Draw(canvas).rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=(200, 200, 200))
    return canvas
jpg(sheet(f'{work}/document-fit.png', (900, 1200), 40), 'scan.jpg')
for k in ('original', 'grayscale', 'document'):
    jpg(sheet(f'{work}/{k}-fit.png', (600, 800), 28), f'look-{k}.jpg')
jpg(sheet(f'{work}/document-fit.png', (600, 800), 28), 'size-fit.jpg')
jpg(sheet(f'{work}/document-a4.png', (600, 800), 28), 'size-a4.jpg')
jpg(sheet(f'{work}/document-letter.png', (600, 800), 28), 'size-letter.jpg')
for name, src in (('limit-none.jpg', 'document-a4-hi.png'), ('limit-500kb.jpg', 'document-a4-500kb-hi.png')):
    im = Image.open(f'{work}/{src}').convert('RGB')
    x, y = CROP
    jpg(im.crop((x, y, x + 600, y + 400)), name)
`;
const py = (code, ...args) => { const f = join(work, `s${Math.random().toString(36).slice(2)}.py`); writeFileSync(f, code); execFileSync('python3', [f, ...args], { stdio: 'inherit' }); };

// 1. the sample photo
py(PHOTO_PY, join(work, 'full.jpg'), join(outdir, 'photo.jpg'), join(work, 'corners.json'));
const truth = JSON.parse(readFileSync(join(work, 'corners.json'), 'utf8')).corners;

// 2. drive the tool
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', dist], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const sizes = {};
let fixedByHand = false;
try {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/scan-to-pdf/`);
  await page.setInputFiles('input[type=file]:not([capture])', join(work, 'full.jpg'));
  const corner = (n) => page.getByRole('button', { name: n });
  const center = async (n) => { const b = await corner(n).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const names = ['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner'];
  await corner(names[0]).waitFor();
  await page.waitForTimeout(3500); // the guess runs after the first paint
  // the displayed photo's rect, to turn true corners into screen points
  const photoBox = await page.evaluate(() => {
    const r = [...document.querySelectorAll('img, canvas')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 250 && b.height > 250)[0];
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  for (let i = 0; i < 4; i++) {
    const [cx, cy] = await center(names[i]);
    const tx = photoBox.x + truth[i][0] * photoBox.w, ty = photoBox.y + truth[i][1] * photoBox.h;
    if (Math.hypot(cx - tx, cy - ty) > 5) {
      fixedByHand = true;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 12 }); await page.mouse.up();
    }
  }
  console.log(fixedByHand ? 'corners: fixed by hand' : 'corners: the guess was close enough, untouched');
  const link = page.locator('a[data-state]');
  const sizeText = async () => ((await link.count() ? await link.first().textContent() : '') || '').match(/(\d+(?:\.\d+)?\s?(?:KB|MB))/)?.[1];
  // The output is rebuilt quietly after every change: wait for the shown size to change (or 8 s), then to hold still.
  const settle = async (before) => {
    for (let i = 0; i < 32 && (await sizeText()) === before; i++) await page.waitForTimeout(250);
    let last = '', stable = 0;
    for (let i = 0; i < 200 && stable < 6; i++) { const t = (await sizeText()) || ''; stable = t && t === last ? stable + 1 : 0; last = t; await page.waitForTimeout(250); }
  };
  const run = async (look, paper, limit, key, hi) => {
    const before = await sizeText();
    await page.getByRole('radio', { name: look, exact: true }).click();
    await page.getByRole('radio', { name: paper, exact: true }).click();
    await page.getByRole('radio', { name: limit, exact: true }).click();
    await settle(before);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), link.click()]).catch(async (e) => { await page.screenshot({ path: join(work, 'fail.png') }); console.log(await link.evaluate((a) => a.outerHTML.slice(0, 200))); throw e; });
    const pdf = join(work, `${key}.pdf`);
    await dl.saveAs(pdf);
    sizes[key] = statSync(pdf).size;
    console.log(key, sizes[key]);
    execFileSync('/opt/homebrew/bin/pdftoppm', ['-r', '110', '-png', '-singlefile', '-f', '1', '-l', '1', pdf, join(work, key)]);
    if (hi) execFileSync('/opt/homebrew/bin/pdftoppm', ['-r', '200', '-png', '-singlefile', '-f', '1', '-l', '1', pdf, join(work, `${key}-hi`)]);
  };
  await run('Original', 'Fit', 'None', 'original-fit');
  await run('Grayscale', 'Fit', 'None', 'grayscale-fit');
  await run('Document', 'Fit', 'None', 'document-fit');
  await run('Document', 'Letter', 'None', 'document-letter');
  await run('Document', 'A4', 'None', 'document-a4', true);
  await run('Document', 'A4', '500 KB', 'document-a4-500kb', true);
  await browser.close();
} finally {
  server.kill();
}

// 3. the images
py(POST_PY, work, outdir, JSON.stringify(crop));
console.log('PDF bytes:', sizes);
console.log('work dir:', work);
