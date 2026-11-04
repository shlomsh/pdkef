const path = require('path');
const fs = require('fs');
const WT = process.env.WT;
const { chromium } = require(path.join(WT, 'node_modules/playwright'));
const esbuild = require(path.join(WT, 'node_modules/esbuild'));
(async () => {
  const dir = __dirname;
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8').replaceAll('SRC/', WT + '/src/');
  const tmpA = path.join(WT, 'src', '.prof-harness.ts');
  const tmpB = path.join(WT, 'src', '.prof-compare.ts');
  const tmpE = path.join(WT, 'src', '.prof-entry.ts');
  fs.writeFileSync(tmpA, read('harness.ts'));
  fs.writeFileSync(tmpB, read('compare.ts'));
  fs.writeFileSync(tmpE, "import './.prof-harness.ts'; import './.prof-compare.ts';");
  let code; let workerCode;
  try {
    code = (await esbuild.build({ entryPoints: [tmpE], bundle: true, format: 'esm', write: false, absWorkingDir: WT, logLevel: 'error' })).outputFiles[0].text;
    workerCode = (await esbuild.build({ entryPoints: [path.join(WT, 'src/tools/scan/lib/pageWork/page.worker.ts')], bundle: true, format: 'esm', write: false, absWorkingDir: WT, logLevel: 'error' })).outputFiles[0].text;
  } finally { [tmpA, tmpB, tmpE].forEach((f) => fs.unlinkSync(f)); }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[err]', e.message));
  page.on('console', (m) => console.log('[page]', m.text()));
  await page.route('http://h/', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.route('http://h/h.js', (r) => r.fulfill({ contentType: 'text/javascript', body: code }));
  await page.route('http://h/page.worker.ts', (r) => r.fulfill({ contentType: 'text/javascript', body: workerCode }));
  await page.goto('http://h/');
  await page.addScriptTag({ url: 'http://h/h.js', type: 'module' });
  await page.waitForFunction(() => window.harness && window.cmp);
  const res = await page.evaluate(async () => {
    const photo = await window.harness.makePhoto(false);
    const q = window.harness.QUAD;
    const upright = await window.cmp.compare(photo, q);
    const turned = await window.cmp.compare(await window.cmp.sideways(photo), q);
    return { upright, turned };
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})();
