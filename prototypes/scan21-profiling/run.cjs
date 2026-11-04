const path = require('path');
const fs = require('fs');
const WT = process.env.WT;
const ROOT = process.env.ROOT || WT;
const ROUNDS = Number(process.env.ROUNDS || 4);
const { chromium } = require(path.join(WT, 'node_modules/playwright'));
const esbuild = require(path.join(WT, 'node_modules/esbuild'));
(async () => {
  const dir = __dirname;
  const src = fs.readFileSync(path.join(dir, 'harness.ts'), 'utf8').replaceAll('SRC/', ROOT + '/src/');
  const tmp = path.join(ROOT, 'src', '.prof-harness.ts');
  fs.writeFileSync(tmp, src);
  let out;
  try {
    out = await esbuild.build({ entryPoints: [tmp], bundle: true, format: 'esm', write: false, absWorkingDir: ROOT, logLevel: 'error' });
  } finally { fs.unlinkSync(tmp); }
  const code = out.outputFiles[0].text;
  const workerSrc = path.join(ROOT, 'src/tools/scan/lib/pageWork/page.worker.ts');
  const workerCode = fs.existsSync(workerSrc) && !process.env.NO_WORKER
    ? (await esbuild.build({ entryPoints: [workerSrc], bundle: true, format: 'esm', write: false, absWorkingDir: ROOT, logLevel: 'error' })).outputFiles[0].text
    : null;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[err]', e.message));
  await page.route('http://h/', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.route('http://h/h.js', (r) => r.fulfill({ contentType: 'text/javascript', body: code }));
  await page.route('http://h/page.worker.ts', (r) => (workerCode ? r.fulfill({ contentType: 'text/javascript', body: workerCode }) : r.fulfill({ status: 404, body: '' })));
  await page.goto('http://h/');
  await page.addScriptTag({ url: 'http://h/h.js', type: 'module' });
  await page.waitForFunction(() => window.harness);
  for (const form of [false, true]) {
    const res = await page.evaluate(async ({ form, rounds }) => {
      const h = window.harness; const photo = await h.makePhoto(form);
      await h.stages(photo); await h.whole(photo, h.QUAD);
      const st = []; const wh = [];
      for (let r = 0; r < rounds; r++) { st.push(await h.stages(photo)); wh.push(await h.whole(photo, h.QUAD)); }
      return { st, wh };
    }, { form, rounds: ROUNDS });
    console.log(form ? 'FORM PAGE' : 'BOOK PAGE', JSON.stringify({ ...res.st[0], t: undefined }));
    for (const k of Object.keys(res.st[0].t)) {
      const v = res.st.map((s) => s.t[k]).sort((a, b) => a - b);
      console.log(k.padEnd(36), 'min', v[0].toFixed(0).padStart(5), 'median', v[v.length >> 1].toFixed(0).padStart(5), 'ms');
    }
    for (const w of res.wh) console.log('  inspectPhoto', w.tInspect.toFixed(0), 'processPage', w.tProcess.toFixed(0), 'longtasks', JSON.stringify(w.longs), 'bentPx', w.page.bentPx);
  }
  await browser.close();
})();
