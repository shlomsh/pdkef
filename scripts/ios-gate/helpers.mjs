// Shared helpers for the iOS gate scenarios (SNG-07). Every scenario gets a
// live WebDriver `session` (see wd.mjs) already on the Safari tab and calls
// only these functions, never raw `s.js`/`s.actions` calls, so the tap/type
// mechanics stay in one place. Native touch (`session.actions`) is the only
// realistic way to reproduce iOS's own zoom, keyboard and focus behaviour;
// a synthetic DOM `click()` proves nothing about any of that.
import fs from 'node:fs';
import path from 'node:path';

export const W3C_ID = 'element-6066-11e4-a52e-4f735466cecf';
export const SAMPLE_PDF = path.resolve(import.meta.dirname, '../../public/images/redaction-guide/sample.pdf');

export async function waitForSel(session, sel, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await session.js(`return !!document.querySelector(${JSON.stringify(sel)})`)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout waiting for ${sel}`);
}

/** One retained 1px fixed marker div per slot, reused across taps:
 * a W3C pointer action needs an element origin, and this is cheaper than creating one per tap. */
async function markerAt(session, slot, x, y) {
  await session.js(
    `if(!document.getElementById('__gate_m${slot}')){const d=document.createElement('div');d.id='__gate_m${slot}';d.style.cssText='position:fixed;width:1px;height:1px;pointer-events:none;left:0;top:0;z-index:2147483647';document.body.appendChild(d);}`,
  );
  await session.js(`const d=document.getElementById('__gate_m${slot}'); d.style.left=(${x})+'px'; d.style.top=(${y})+'px';`);
  const id = await session.find('css selector', `#__gate_m${slot}`);
  return { [W3C_ID]: id };
}

export async function tapAt(session, x, y, slot = 0) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const origin = await markerAt(session, slot, x, y);
      await session.actions([{
        type: 'pointer', id: `finger${slot}`, parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, origin, x: 0, y: 0 },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 80 },
          { type: 'pointerUp', button: 0 },
        ],
      }]);
      return;
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

/** Two-finger pinch on the native WebView element. */
export async function pinch(session, { scale = 2.5, velocity = 1.5 } = {}) {
  const webviewEl = await session.native(async () => (await session.findAll('class name', 'XCUIElementTypeWebView'))[0]);
  await session.js('mobile: pinch', { scale, velocity, elementId: webviewEl });
}

export async function rectOfSelector(session, selector) {
  return session.js(
    `const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};`,
  );
}

/**
 * `visualViewport.offsetTop` is nonzero once the keyboard (or Safari's own retracting chrome)
 * has shrunk the visible screen band within the layout viewport: an element above that band is
 * covered by native UI and genuinely off-screen, which WDA reports as "out of view" on a tap
 * (measured live: a field left focused before `native Next` moved focus elsewhere scrolled
 * behind the top chrome once the keyboard settled). `getBoundingClientRect`/`elementFromPoint`
 * stay layout-viewport-based regardless, so centering the target within `[offsetTop, offsetTop +
 * height]` before every risky tap - never assuming the app's own auto-scroll already did it -
 * is what makes a real screen tap resolve at all.
 */
export async function ensureVisible(session, selector) {
  await session.js(`
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return;
    const vv = visualViewport;
    const r = el.getBoundingClientRect();
    // 100px of headroom above the element's own top: an editor element's floating toolbar
    // (ElementToolbar/DraggableWrapper's "top-start") renders above the element itself, so
    // centring the element alone can still leave the toolbar poking above the visible band -
    // measured live (element in-band, its own toolbar rect at half the band's own offsetTop).
    const desiredTop = vv.offsetTop + 100;
    if (r.top < desiredTop || r.bottom > vv.offsetTop + vv.height - 10) {
      window.scrollBy(0, r.top - desiredTop);
    }
  `);
  await new Promise((r) => setTimeout(r, 400));
}

export async function tapSelector(session, selector, slot = 0) {
  await ensureVisible(session, selector);
  const rect = await rectOfSelector(session, selector);
  if (!rect) throw new Error(`no element for ${selector}`);
  await tapAt(session, rect.x + rect.w / 2, rect.y + rect.h / 2, slot);
}

/** Real key actions - a JS `.value =` write never exercises the
 * keyboard, autocorrect or the input events the app's own handlers listen for. */
export async function typeText(session, text) {
  await session.actions([{
    type: 'key', id: 'kb',
    actions: [...text].flatMap((c) => [{ type: 'keyDown', value: c }, { type: 'keyUp', value: c }]),
  }]);
}

export async function nativeKeyboardUp(session) {
  return session.native(async () => (await session.findAll('class name', 'XCUIElementTypeKeyboard')).length > 0);
}

/** Native "Next" key on the keyboard's own form-navigation accessory bar (present
 * and clickable via accessibility id 'Next' on this iOS/WKWebView build). Fill mode has no
 * on-page "Next" toolbar control (PdfWorkspace.tsx passes `fieldNav: null` while `fill.enabled`),
 * so the native key is the only "Next" there is; a missing one is a real gap, not a fallback path. */
export async function tapNativeNext(session) {
  await session.native(async () => {
    const el = await session.find('accessibility id', 'Next');
    await session.click(el);
  });
}

export async function visualViewportScale(session) {
  return session.js('return visualViewport.scale');
}

export async function activeElementInfo(session) {
  return session.js(
    `const el=document.activeElement; return {tag: el ? el.tagName : null, fillKey: el ? el.getAttribute('data-fill-key') : null, isBody: el === document.body};`,
  );
}

/** Loads the sample PDF into `/sign/?next=1`: a DataTransfer on the
 * hidden file input, then the "Replace file" confirm if a previous draft is still remembered
 * for this origin (a fresh preview has none, but a second gate run in the same session does). */
export async function loadFillMode(session, baseUrl) {
  await session.go(`${baseUrl}/sign/?next=1`);
  await waitForSel(session, 'astro-island[client="load"]:not([ssr])');
  await waitForSel(session, 'input[type="file"]');
  const b64 = fs.readFileSync(SAMPLE_PDF).toString('base64');
  await session.js(
    `const b64 = arguments[0];
     const bin = atob(b64); const bytes = new Uint8Array(bin.length);
     for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
     const file = new File([bytes], 'sample.pdf', {type:'application/pdf'});
     const dt = new DataTransfer(); dt.items.add(file);
     const input = document.querySelector('input[type="file"]');
     input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles:true}));`,
    b64,
  );
  await new Promise((r) => setTimeout(r, 700));
  const hasReplace = await session.js(
    `return !![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Replace file')`,
  );
  if (hasReplace) {
    const btn = await session.find('xpath', "//button[normalize-space(text())='Replace file']");
    await session.click(btn);
    await new Promise((r) => setTimeout(r, 500));
  }
  await waitForSel(session, '[data-fill-input]');
}

/** Every `[data-fill-input]` currently in the DOM, in document order, each with its rect and
 * fill key - used to pick "the first field" / "a different field" without hard-coding one. */
export async function fillInputs(session) {
  return session.js(
    `return [...document.querySelectorAll('[data-fill-input]')].map(el => { const r = el.getBoundingClientRect();
      return { key: el.getAttribute('data-fill-key'), x: r.x + r.width/2, y: r.y + r.height/2 }; });`,
  );
}

export async function screenshotTo(session, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(await session.screenshot(), 'base64'));
  return file;
}

/** A viewport point that is not on any control - the page background beside/below the
 * rendered PDF page, or an app chrome margin - by sampling candidates and rejecting any whose
 * `elementFromPoint` closest match is a link, button, input, textarea or editor/fill element.
 * Blind coordinates risk landing on a header link and navigating away. */
export async function findOutsideTapPoint(session) {
  const result = await session.js(`
    const vv = visualViewport;
    // Every candidate's y is offsetTop-relative (visible-band-relative): the raw layout y of the
    // visible band's own top edge shifts with the keyboard, so a bare vv.height fraction can land
    // above the visible band and read as "outside" while actually being off-screen (see
    // ensureVisible's own doc in this file for the same visualViewport.offsetTop hazard).
    const candidates = [
      [vv.width - 6, vv.offsetTop + vv.height * 0.5],
      [6, vv.offsetTop + vv.height * 0.5],
      [vv.width * 0.5, vv.offsetTop + vv.height - 6],
      [vv.width * 0.5, vv.offsetTop + 6],
    ];
    const bad = 'a, button, input, textarea, select, [data-fill-input], [data-editor-element], [data-editor-actions], [data-editor-resizer], nav, header, dialog';
    for (const [x, y] of candidates) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest(bad)) return { x, y };
    }
    return null;
  `);
  if (!result) throw new Error('no safe outside-tap point found');
  return result;
}
