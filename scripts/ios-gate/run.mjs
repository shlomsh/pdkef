#!/usr/bin/env node
// SNG-07: the iOS Simulator gate. Drives Sign's fill mode (`/sign/?next=1`)
// on a real booted iPhone through Appium's XCUITest driver and prints one
// PASS/FAIL/MANUAL line per scenario (scenarios.mjs), non-zero exit on any
// FAIL. Not part of check:push or CI - run it by hand before a release and
// after any Sign mobile change (see .claude/rules/tests.md).
import { execSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { openSession, serverStatus } from './wd.mjs';
import * as helpers from './helpers.mjs';
import { SCENARIOS } from './scenarios.mjs';

const APPIUM_BASE = 'http://127.0.0.1:4723/wd/hub';
const PREVIEW_URL = 'http://[::1]:4173';
const PREVIEW_CHECK_URL = 'http://localhost:4173/';
const APPIUM_HOME = path.resolve(import.meta.dirname, '../../node_modules/.cache/appium');
const SCREENSHOT_DIR = path.join(os.tmpdir(), 'pdkef-ios-gate');

async function checkPreview() {
  try {
    const res = await fetch(PREVIEW_CHECK_URL);
    return res.ok;
  } catch {
    return false;
  }
}

/** Starts Appium (with APPIUM_HOME above) if nothing answers on 4723 yet, and
 * returns a stop function - a no-op if this run did not start it, so the gate only ever
 * stops what it started. */
async function ensureAppium() {
  const already = await serverStatus(APPIUM_BASE);
  if (already) return { stop: async () => {} };
  console.log('Starting Appium server (APPIUM_HOME=%s)...', APPIUM_HOME);
  const child = spawn(
    path.resolve(import.meta.dirname, '../../node_modules/.bin/appium'),
    ['server', '--address', '127.0.0.1', '--port', '4723', '--base-path', '/wd/hub', '--relaxed-security'],
    { env: { ...process.env, APPIUM_HOME }, stdio: 'ignore', detached: true },
  );
  child.unref();
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    if (await serverStatus(APPIUM_BASE)) return { stop: async () => { try { process.kill(child.pid); } catch { /* already gone */ } } };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Appium did not become ready within 30s');
}

function bootedIphoneUdid() {
  const out = execSync('xcrun simctl list devices booted', { encoding: 'utf8' });
  const match = out.match(/iPhone[^(]*\(([0-9A-Fa-f-]{36})\)/);
  if (!match) throw new Error('no booted iPhone simulator found (boot one in Simulator.app first)');
  return match[1];
}

async function main() {
  if (!(await checkPreview())) {
    console.error(
      'The preview on 4173 is not responding.\n' +
      'Run `npm run build && npm run preview` first (one preview per worktree, per CLAUDE.md) and re-run `npm run gate:ios`.',
    );
    process.exit(1);
  }

  const udid = bootedIphoneUdid();
  const appium = await ensureAppium();
  let session;
  const results = [];
  try {
    session = await openSession(APPIUM_BASE, {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      browserName: 'Safari',
      'appium:udid': udid,
      'appium:deviceName': 'iPhone',
      'appium:nativeWebTap': true,
      'appium:wdaLocalPort': 8100,
      'appium:derivedDataPath': path.join(os.tmpdir(), 'pdkef-ios-gate-derivedData'),
      'appium:showXcodeLog': false,
    });
    await session.timeouts({ script: 60000 });
    await helpers.loadFillMode(session, PREVIEW_URL);

    const ctx = {};
    for (const scenario of SCENARIOS) {
      let result;
      try {
        result = await scenario.run(session, helpers, ctx);
      } catch (e) {
        result = { status: 'fail', reason: String(e && e.stack ? e.stack : e) };
      }
      let screenshotPath = null;
      try {
        screenshotPath = await helpers.screenshotTo(session, SCREENSHOT_DIR, scenario.name);
      } catch { /* a screenshot failure never masks the scenario's own result */ }
      results.push({ ...result, name: scenario.name, screenshot: screenshotPath });
      const label = result.status === 'pass' ? 'PASS' : result.status === 'manual' ? 'MANUAL' : 'FAIL';
      console.log(`${label}  ${scenario.name} - ${result.reason}`);
    }
  } finally {
    if (session) await session.quit().catch(() => {});
    await appium.stop();
  }

  const failed = results.filter((r) => r.status === 'fail');
  console.log(`\n${results.length} scenarios: ${results.filter((r) => r.status === 'pass').length} passed, ` +
    `${results.filter((r) => r.status === 'manual').length} manual, ${failed.length} failed.`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
