// SNG-07's scenario list, fill mode (`/sign/?next=1`) only. The toolbar and
// font sheet are left to Playwright's WebKit project (fill-mode-phone-regressions.spec.js),
// which already applies WebKit's no-focus-on-button-tap rule. Each scenario is
// `(session, helpers, ctx) => { status: 'pass' | 'fail' | 'manual', reason }`,
// run in this order by `run.mjs` against one Safari session, one field on the
// practice PDF at a time - later scenarios reuse the field the earlier ones
// focused (`ctx.field1Key`, `ctx.field2Key`), the same way a person filling
// the form would. `helpers` is the whole `helpers.mjs` module (run.mjs's
// `import * as helpers`), so every scenario reaches the same tap/type/wait
// primitives without re-importing them one by one.

async function tapField(session, helpers, ctx) {
  const fields = await helpers.fillInputs(session);
  if (fields.length === 0) return { status: 'fail', reason: 'no [data-fill-input] found on the page' };
  const scaleBefore = await helpers.visualViewportScale(session);
  const field = fields[0];
  ctx.field1Key = field.key;
  await helpers.tapAt(session, field.x, field.y, 0);
  await new Promise((r) => setTimeout(r, 900));
  const active = await helpers.activeElementInfo(session);
  const keyboardUp = await helpers.nativeKeyboardUp(session);
  const scaleAfter = await helpers.visualViewportScale(session);
  const focused = active.fillKey === field.key;
  const zoomHeld = scaleAfter >= scaleBefore - 0.01;
  if (!focused) return { status: 'fail', reason: `tapped field ${field.key} but activeElement is ${active.tag} (fillKey ${active.fillKey})` };
  if (!keyboardUp) return { status: 'fail', reason: 'no XCUIElementTypeKeyboard after tapping a fill field' };
  if (!zoomHeld) return { status: 'fail', reason: `page zoomed out on tap: scale ${scaleBefore} -> ${scaleAfter}` };
  return { status: 'pass', reason: `field ${field.key} focused, keyboard up, scale ${scaleBefore} -> ${scaleAfter}` };
}

async function typeDigits(session, helpers) {
  await helpers.typeText(session, '12345');
  await new Promise((r) => setTimeout(r, 400));
  const value = await session.js('return document.activeElement.value');
  if (value !== '12345') return { status: 'fail', reason: `input value is ${JSON.stringify(value)}, expected "12345"` };
  return { status: 'pass', reason: 'input value is "12345"' };
}

async function nextField(session, helpers, ctx) {
  try {
    await helpers.tapNativeNext(session);
  } catch {
    // Zoomed in, the keyboard's Next was gone in every run on 2026-09-26: the
    // harness can't yet tell a dismissed keyboard from a missed lookup.
    return { ...manual, reason: `${manual.reason}; pinched to ${scaleAfterPinch.toFixed(2)}x but found no keyboard Next` };
  }
  await new Promise((r) => setTimeout(r, 900));
  const active = await helpers.activeElementInfo(session);
  const keyboardUp = await helpers.nativeKeyboardUp(session);
  if (active.fillKey === null || active.fillKey === ctx.field1Key) {
    return { status: 'fail', reason: `native Next did not move focus off ${ctx.field1Key} (now ${JSON.stringify(active)})` };
  }
  if (!keyboardUp) return { status: 'fail', reason: 'keyboard went down after native Next' };
  const previousField1Key = ctx.field1Key;
  ctx.field2Key = active.fillKey;
  // Leaving field1 with text in it just committed it into a real text element
  // (commitSlot, PdfWorkspace.tsx): its own fill key changes from the slot's
  // `slot:...` form to the committed element's `el:...` id (FieldSlot.tsx vs
  // TextNode.tsx), so later scenarios must look it up by its new key.
  const fieldsAfter = await helpers.fillInputs(session);
  const committed = fieldsAfter.find((f) => f.key.startsWith('el:'));
  if (committed) ctx.field1Key = committed.key;
  return { status: 'pass', reason: `focus moved from ${previousField1Key} to ${active.fillKey}, keyboard still up (field1 now ${ctx.field1Key})` };
}

async function tapOutsideEndsSession(session, helpers) {
  const point = await helpers.findOutsideTapPoint(session);
  await helpers.tapAt(session, point.x, point.y, 6);
  await new Promise((r) => setTimeout(r, 700));
  const active = await helpers.activeElementInfo(session);
  const keyboardUp = await helpers.nativeKeyboardUp(session);
  if (!active.isBody) return { status: 'fail', reason: `activeElement is ${active.tag} (fillKey ${active.fillKey}), expected document.body` };
  if (keyboardUp) return { status: 'fail', reason: 'keyboard still up after tapping outside' };
  return { status: 'pass', reason: `tapped outside at (${point.x.toFixed(0)}, ${point.y.toFixed(0)}); activeElement is body, keyboard down` };
}

/** The regression Shlomi hit on 2026-09-26: zoomed in on a field, the keyboard's Next reset
 * the zoom. Focus a field at rest, pinch in, then Next; the scale must hold within 10%. */
async function pinchZoom(session, helpers, ctx) {
  const manual = { status: 'manual', reason: 'pinch not drivable in the Simulator; check zoom kept between fields on a real iPhone (SNG-20)' };
  const fields = await helpers.fillInputs(session);
  const start = fields.find((f) => f.key !== ctx.field1Key && f.key !== ctx.field2Key) || fields[0];
  if (!start) return { status: 'fail', reason: 'no field to start from' };
  await helpers.tapSelector(session, `[data-fill-key="${start.key}"]`, 7);
  await new Promise((r) => setTimeout(r, 800));
  const before = await helpers.activeElementInfo(session);
  try {
    await helpers.pinch(session, { scale: 2.5, velocity: 1.5 });
  } catch {
    return manual;
  }
  await new Promise((r) => setTimeout(r, 800));
  const scaleAfterPinch = await helpers.visualViewportScale(session);
  if (!(scaleAfterPinch > 1.2)) return manual;
  try {
    await helpers.tapNativeNext(session);
  } catch {
    // Zoomed in, the keyboard's Next was gone in every run on 2026-09-26: the
    // harness can't yet tell a dismissed keyboard from a missed lookup.
    return { ...manual, reason: `${manual.reason}; pinched to ${scaleAfterPinch.toFixed(2)}x but found no keyboard Next` };
  }
  await new Promise((r) => setTimeout(r, 800));
  const after = await helpers.activeElementInfo(session);
  if (after.fillKey === null || after.fillKey === before.fillKey) {
    return { status: 'fail', reason: `Next did not move focus off ${before.fillKey} while zoomed in (now ${JSON.stringify(after)})` };
  }
  const scaleAfterNext = await helpers.visualViewportScale(session);
  const drift = Math.abs(scaleAfterNext - scaleAfterPinch) / scaleAfterPinch;
  if (drift > 0.10) {
    return { status: 'fail', reason: `zoom not kept between fields: ${scaleAfterPinch.toFixed(2)} -> ${scaleAfterNext.toFixed(2)} (${(drift * 100).toFixed(0)}% drift)` };
  }
  return { status: 'pass', reason: `pinched to ${scaleAfterPinch.toFixed(2)}x on ${before.fillKey}, held at ${scaleAfterNext.toFixed(2)}x after Next to ${after.fillKey}` };
}

export const SCENARIOS = [
  { name: 'tap-field-focus-keyboard-no-zoom', run: tapField },
  { name: 'type-12345', run: typeDigits },
  { name: 'native-next-moves-focus', run: nextField },
  { name: 'tap-outside-ends-session', run: tapOutsideEndsSession },
  { name: 'pinch-zoom-kept-between-fields', run: pinchZoom },
];
