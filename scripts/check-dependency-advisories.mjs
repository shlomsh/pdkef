#!/usr/bin/env node

/**
 * Turns npm audit's raw, all-severity report into the repository's scheduled
 * high/critical advisory signal. It deliberately is not part of normal PR CI:
 * new vulnerable dependencies are blocked by dependency-review-action, while
 * existing findings need owned, documented triage rather than an opaque audit
 * failure on every unrelated pull request.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const HIGH_SEVERITIES = new Set(['high', 'critical']);
const reportPath = resolve(process.cwd(), process.argv[2] ?? 'dependency-audit.json');
const exceptionPath = resolve(process.cwd(), 'security/dependency-advisory-exceptions.json');
const today = new Date().toISOString().slice(0, 10);
const maxExceptionDate = new Date(`${today}T00:00:00.000Z`);
maxExceptionDate.setUTCDate(maxExceptionDate.getUTCDate() + 30);
const latestExceptionDate = maxExceptionDate.toISOString().slice(0, 10);

function advisoryId(via) {
  if (!via || typeof via !== 'object') return null;
  const url = via.url ?? '';
  return url.match(/GHSA-[\w-]+/i)?.[0]?.toUpperCase() ?? null;
}

function activeException(exceptions, packageName, id) {
  return exceptions.find((exception) => (
    exception.package === packageName
    && exception.advisory === id
    && exception.expires >= today
  ));
}

function validateExceptions(exceptions) {
  const invalid = exceptions.filter((exception) => (
    typeof exception.package !== 'string'
    || !/^GHSA-[\w-]+$/i.test(exception.advisory ?? '')
    || !/^\d{4}-\d{2}-\d{2}$/.test(exception.expires ?? '')
    || exception.expires < today
    || exception.expires > latestExceptionDate
    || typeof exception.rationale !== 'string'
    || !exception.rationale.trim()
    || typeof exception.owner !== 'string'
    || !exception.owner.trim()
    || typeof exception.nextReview !== 'string'
    || !exception.nextReview.trim()
  ));

  if (invalid.length) {
    throw new Error(
      `Invalid or expired dependency advisory exception(s): ${invalid.map(({ package: name, advisory }) => `${name ?? '<unknown>'}/${advisory ?? '<unknown>'}`).join(', ')}`,
    );
  }
}

let report;
let exceptionFile;
try {
  [report, exceptionFile] = await Promise.all([
    readFile(reportPath, 'utf8').then(JSON.parse),
    readFile(exceptionPath, 'utf8').then(JSON.parse),
  ]);
} catch (error) {
  console.error(`Could not read the dependency advisory inputs: ${error.message}`);
  process.exitCode = 1;
  process.exit();
}

if (report.error) {
  console.error(`npm audit could not retrieve an advisory report: ${report.error.summary ?? report.error.message ?? JSON.stringify(report.error)}`);
  process.exitCode = 1;
  process.exit();
}

const exceptions = exceptionFile.exceptions;
if (!Array.isArray(exceptions)) {
  console.error('security/dependency-advisory-exceptions.json must contain an exceptions array.');
  process.exitCode = 1;
  process.exit();
}

try {
  validateExceptions(exceptions);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  process.exit();
}

const outstanding = [];
const excepted = [];
for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  if (!HIGH_SEVERITIES.has(vulnerability.severity)) continue;

  const advisories = (Array.isArray(vulnerability.via) ? vulnerability.via : [])
    .filter((via) => via && typeof via === 'object' && HIGH_SEVERITIES.has(via.severity));

  if (!advisories.length) {
    outstanding.push(`${packageName} (${vulnerability.severity}; advisory ID unavailable)`);
    continue;
  }

  for (const advisory of advisories) {
    const id = advisoryId(advisory);
    const finding = `${packageName} (${advisory.severity}; ${id ?? 'advisory ID unavailable'})`;
    const matchingException = id && activeException(exceptions, packageName, id);
    if (matchingException) {
      excepted.push(`${finding}; exception expires ${matchingException.expires}`);
    } else {
      outstanding.push(finding);
    }
  }
}

if (excepted.length) console.log(`Active dependency advisory exception(s):\n- ${excepted.join('\n- ')}`);
if (outstanding.length) {
  console.error(`Untriaged high/critical dependency advisory finding(s):\n- ${outstanding.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Dependency advisory policy passed: no untriaged high/critical findings.');
}
