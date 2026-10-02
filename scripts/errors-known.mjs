// Known-items registry and pure classifier for `npm run errors:read`.
// No I/O here; git access arrives as an injected run(args) (throws on failure; an error from
// `git merge-base --is-ancestor` has .status === 1 for "not an ancestor", any other failure is no answer).
import { frameLabel } from './errors-frames.mjs';

// The commit that first stamped builds with their commit: a stamped report carries `build`, an older tab none.
export const STAMP_COMMIT = 'f27c2b71';

const HEX = /^[0-9a-f]{7,40}$/;
const MATCH_KEYS = ['area', 'name', 'step', 'slug', 'module'];

// '/merge/' -> 'merge', '/he/merge/' -> 'merge', '/' -> 'home'; anything else -> ''.
export function toSlug(tool) {
  if (typeof tool !== 'string' || !tool) return '';
  const parts = tool.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : tool.startsWith('/') ? 'home' : '';
}

// `area|name|frame|step|engine` plus the parsed stored sample (may be null).
export function describeFingerprint(field, sample) {
  const [area = '', name = '', frame = '', step = '', engine = ''] = String(field ?? '').split('|');
  return { area, name, step, engine, slug: toSlug(sample?.tool), module: frameLabel(frame).module };
}

const listed = (want, got) => (Array.isArray(want) ? want : [want]).includes(got);

export function matchEntry(entry, fp) {
  return Object.entries(entry.match ?? {}).every(([key, want]) => listed(want, fp[key]));
}

export function findEntry(entries, fp) {
  return (entries ?? []).find((entry) => matchEntry(entry, fp)) ?? null;
}

const validValue = (v) => typeof v === 'string' || (Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string'));

export function validateRegistry(json) {
  if (!Array.isArray(json)) return ['registry must be an array'];
  const errors = [];
  const seen = new Set();
  json.forEach((entry, i) => {
    const at = `entry ${i}${entry?.id ? ` (${entry.id})` : ''}`;
    if (!entry || typeof entry !== 'object') return errors.push(`${at}: must be an object`);
    for (const key of ['id', 'ticket', 'title']) {
      if (typeof entry[key] !== 'string' || !entry[key]) errors.push(`${at}: ${key} must be a non-empty string`);
    }
    if (seen.has(entry.id)) errors.push(`${at}: duplicate id`);
    seen.add(entry.id);
    const match = entry.match;
    if (!match || typeof match !== 'object' || Array.isArray(match)) {
      errors.push(`${at}: match must be an object`);
    } else {
      const keys = Object.keys(match);
      if (!keys.length) errors.push(`${at}: match needs at least one key`);
      for (const key of keys) {
        if (!MATCH_KEYS.includes(key)) errors.push(`${at}: unknown match key ${key}`);
        else if (!validValue(match[key])) errors.push(`${at}: match.${key} must be a string or a list of strings`);
      }
    }
    const hasFix = entry.fixedIn !== undefined;
    const isOpen = entry.open !== undefined;
    if (isOpen && entry.open !== true) errors.push(`${at}: open must be true`);
    if (hasFix === isOpen) errors.push(`${at}: needs exactly one of fixedIn or open: true`);
    if (hasFix && !HEX.test(String(entry.fixedIn))) errors.push(`${at}: fixedIn must be 7 to 40 lowercase hex characters`);
  });
  return errors;
}

// 'yes' (is an ancestor), 'no' (status 1), or 'unknown' (any other failure).
function ancestor(run, older, newer) {
  try {
    run(['merge-base', '--is-ancestor', older, newer]);
    return 'yes';
  } catch (error) {
    return error?.status === 1 ? 'no' : 'unknown';
  }
}

export function classify({ entry, build, run }) {
  if (!entry) return { category: 'new', actionable: true, reason: 'not in the known items', ticket: null };
  const { ticket } = entry;
  if (entry.open) {
    return { category: 'known_open', actionable: false, reason: `known and still open: ${ticket}`, ticket };
  }
  const tell = { category: 'unverifiable', actionable: true, reason: 'git could not tell whether the build has the fix', ticket };
  if (build) {
    const answer = ancestor(run, entry.fixedIn, build);
    if (answer === 'yes') {
      return { category: 'regression', actionable: true, reason: `build ${build} contains the fix ${entry.fixedIn}`, ticket };
    }
    if (answer === 'no') return { category: 'old_tab', actionable: false, reason: `build ${build} predates the fix`, ticket };
    return tell;
  }
  const answer = ancestor(run, entry.fixedIn, STAMP_COMMIT);
  if (answer === 'no') {
    return {
      category: 'old_tab',
      actionable: false,
      reason: 'no build stamp, and the fix is newer than stamping, so this tab predates it',
      ticket,
    };
  }
  if (answer === 'yes') {
    return { category: 'unverifiable', actionable: true, reason: 'no build stamp and the fix predates stamping: resolve it to tell', ticket };
  }
  return tell;
}
