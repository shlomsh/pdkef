// ARCH-76: every ratchet reads its limit from scripts/ratchet-limits.json, and
// scripts/check-ratchet-raises.mjs fails CI when a value there rises against the
// base. "Only ever go down" is now a check, not a convention.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function limitsPath(root = defaultRoot) {
  return path.join(root, 'scripts', 'ratchet-limits.json');
}

export function readRatchetLimits(root = defaultRoot) {
  return JSON.parse(fs.readFileSync(limitsPath(root), 'utf8'));
}

function sortDeep(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortDeep(value[k])]));
}

// Keys sorted, 2-space indent, trailing newline: the one shape the file has.
export function serializeRatchetLimits(limits) {
  return `${JSON.stringify(sortDeep(limits), null, 2)}\n`;
}

export function writeRatchetLimits(limits, root = defaultRoot) {
  fs.writeFileSync(limitsPath(root), serializeRatchetLimits(limits));
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Pure. A numeric leaf that rose fails; a key new inside a top-level section that
// already existed at base fails (adding to an allowlist is a raise); a whole new
// top-level section passes (that is how a ratchet is introduced); lowering or
// removing passes.
export function findRaises(baseJson, headJson) {
  const raises = [];
  const walk = (before, after, trail) => {
    for (const key of Object.keys(after)) {
      const p = [...trail, key];
      const label = p.join('.');
      if (!(key in before)) {
        raises.push({ path: label, before: undefined, after: after[key], kind: 'added' });
      } else if (isObject(after[key]) && isObject(before[key])) {
        walk(before[key], after[key], p);
      } else if (typeof after[key] === 'number' && typeof before[key] === 'number' && after[key] > before[key]) {
        raises.push({ path: label, before: before[key], after: after[key], kind: 'raised' });
      }
    }
  };
  for (const section of Object.keys(headJson)) {
    if (!(section in baseJson)) continue;
    if (isObject(headJson[section]) && isObject(baseJson[section])) walk(baseJson[section], headJson[section], [section]);
    else if (typeof headJson[section] === 'number' && headJson[section] > baseJson[section]) {
      raises.push({ path: section, before: baseJson[section], after: headJson[section], kind: 'raised' });
    }
  }
  return raises;
}
