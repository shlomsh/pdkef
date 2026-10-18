#!/usr/bin/env node

/**
 * A local dry-run of the repository wiring: a Dependabot npm PR must receive
 * both dependency review and the full platform-bound release pipeline.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const required = [
  ['.github/dependabot.yml', 'package-ecosystem: npm'],
  ['.github/dependabot.yml', 'pdf-and-runtime:'],
  ['.github/dependabot.yml', 'build-tool-patches:'],
  ['.github/workflows/dependency-review.yml', 'actions/dependency-review-action@v4'],
  ['.github/workflows/dependency-review.yml', 'fail-on-severity: high'],
  ['.github/workflows/dependency-advisories.yml', 'npm audit --json'],
  ['.github/workflows/dependency-advisories.yml', 'check-dependency-advisories.mjs'],
  ['.github/workflows/ci.yml', 'pull_request:'],
  ['.github/workflows/ci.yml', 'npm run test:licenses'],
  ['.github/workflows/ci.yml', 'npm run build'],
  ['.github/workflows/ci.yml', 'npm run test:csp'],
  ['.github/workflows/ci.yml', 'npm run test:css'],
  ['.github/workflows/ci.yml', 'npm run test:weight'],
  ['.github/workflows/ci.yml', 'npx playwright test'],
];

const cache = new Map();
for (const [file, expected] of required) {
  const content = cache.get(file) ?? await readFile(resolve(process.cwd(), file), 'utf8');
  cache.set(file, content);
  if (!content.includes(expected)) throw new Error(`${file} is missing required dependency-governance wiring: ${expected}`);
}

// QUAL-25: the Playwright jobs run in the Playwright image, whose browsers
// belong to one exact Playwright release. A lockfile bump without a matching
// tag would run the tests against browsers the new release does not expect.
const lock = JSON.parse(await readFile(resolve(process.cwd(), 'package-lock.json'), 'utf8'));
const playwrightVersion = lock.packages['node_modules/@playwright/test'].version;
const ci = cache.get('.github/workflows/ci.yml');
const imageTags = [...ci.matchAll(/mcr\.microsoft\.com\/playwright:v([^\s-]+)-/g)].map((m) => m[1]);
if (imageTags.length === 0) throw new Error('.github/workflows/ci.yml names no Playwright container image');
const drifted = imageTags.filter((tag) => tag !== playwrightVersion);
if (drifted.length > 0) {
  throw new Error(`ci.yml's Playwright image tag (${[...new Set(drifted)].join(', ')}) does not match @playwright/test ${playwrightVersion} in package-lock.json; update every mcr.microsoft.com/playwright:v... tag`);
}

console.log('Dependency governance dry-run passed: npm update PRs retain dependency review and release gates.');
