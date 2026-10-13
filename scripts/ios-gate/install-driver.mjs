#!/usr/bin/env node
// One-time setup for `npm run gate:ios`: installs Appium's XCUITest driver into
// node_modules/.cache/appium and pins its shell-quote to a patched release.
// The driver lives outside the lockfile, so the repo's `shell-quote` override and
// `npm audit` never see it, and it bundles its own copy (bundleDependencies), which
// an npm override cannot replace. So: override the hoisted copy, then delete the
// bundled ones so Node resolves the hoisted one.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DRIVER = 'xcuitest@12.13.2';
const SHELL_QUOTE_RANGE = '^1.11.0';
const root = path.resolve(import.meta.dirname, '../..');
const appiumHome = path.join(root, 'node_modules/.cache/appium');
const env = { ...process.env, APPIUM_HOME: appiumHome };
const run = (bin, args, cwd = root) => execFileSync(bin, args, { cwd, env, stdio: 'inherit' });

run(path.join(root, 'node_modules/.bin/appium'), ['driver', 'install', DRIVER]);

const manifestPath = path.join(appiumHome, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.overrides = { ...manifest.overrides, 'shell-quote': SHELL_QUOTE_RANGE };
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
run('npm', ['install', '--no-audit', '--no-fund'], appiumHome);

const nodeModules = path.join(appiumHome, 'node_modules');
for (const pkg of fs.readdirSync(nodeModules)) {
  const nested = path.join(nodeModules, pkg, 'node_modules/shell-quote');
  if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true });
}

const { version } = JSON.parse(fs.readFileSync(path.join(nodeModules, 'shell-quote/package.json'), 'utf8'));
console.log(`XCUITest driver installed; shell-quote ${version} for every consumer.`);
