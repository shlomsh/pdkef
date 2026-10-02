// Joins the fingerprint table, the known-items registry and the history into the verdict the daily
// error read leads with (DEBT-36). Pure: git arrives as an injected run(args), the registry as data.
import { classify, describeFingerprint, findEntry } from './errors-known.mjs';

const ORDER = { regression: 0, unverifiable: 1, new: 2 };
const LABEL = { regression: 'REGRESSION', unverifiable: 'UNVERIFIED', new: 'UNKNOWN' };

function parseSample(raw) {
  try {
    const sample = JSON.parse(raw ?? 'null');
    return sample && typeof sample === 'object' ? sample : null;
  } catch {
    // expected: a stored sample that does not parse is treated as absent
    return null;
  }
}

/**
 * `table` is [[field, count], ...] for the window, `samples` Map<field, raw JSON>, `history` Map<field,
 * fingerprintHistory entry>, `entries` the registry. Returns { needs, known }: items that need attention
 * (regression, then unverifiable, then new; by count within each) and items that are known and not actionable.
 */
export function triage({ table, samples, history, entries, run }) {
  const items = table.map(([field, count]) => {
    const sample = parseSample(samples.get(field));
    const fp = describeFingerprint(field, sample);
    const build = typeof sample?.build === 'string' ? sample.build : undefined;
    const entry = findEntry(entries, fp);
    return { field, count, sample, fp, build, entry, verdict: classify({ entry, build, run }), history: history.get(field) ?? null };
  });
  const needs = items
    .filter((i) => i.verdict.actionable)
    .sort((a, b) => ORDER[a.verdict.category] - ORDER[b.verdict.category] || b.count - a.count || a.field.localeCompare(b.field));
  const known = items.filter((i) => !i.verdict.actionable).sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));
  return { needs, known };
}

function newness(history) {
  if (!history) return '';
  if (history.noHistory) return 'no earlier days to compare';
  // Within the fetched history only: "first seen" is a floor, and a rebuilt chunk changes the fingerprint's hash.
  if (history.isNew) return `not seen on earlier days (first seen ${history.firstSeen})`;
  return `seen on ${history.daysSeen} of ${history.historyDays} days (earliest in history: ${history.firstSeen})`;
}

const describe = ({ count, fp }) => `${count}x ${fp.area} ${fp.name} ${fp.step} on ${fp.slug || '?'} (${fp.engine})`;

// The store keeps one sample per fingerprint per day, so a verdict that depends on the build (a known fix) is
// read from the latest report while the count covers them all. Say so rather than imply all N were judged.
const basis = (i) => (i.entry && !i.entry.open && i.count > 1 ? `judged on the latest of ${i.count} reports` : '');

/** The lines errors:read prints first. `rates` is toolRates()'s output; flagged tools join "Needs attention". */
export function renderTriage({ needs, known }, rates) {
  const rising = rates.filter((r) => r.flag);
  const total = needs.length + rising.length;
  const out = [];
  if (!total) out.push('Needs attention: nothing');
  else {
    out.push(`Needs attention (${total})`);
    for (const i of needs) {
      const tail = [i.verdict.reason, basis(i), newness(i.history)].filter(Boolean).join('; ');
      out.push(`  ${LABEL[i.verdict.category]}  ${describe(i)}: ${tail}${i.verdict.ticket ? ` (${i.verdict.ticket})` : ''}`);
    }
    for (const r of rising) out.push(`  RISING  ${r.tool}: ${r.why}`);
  }
  if (known.length) {
    out.push(`Known, not actionable (${known.length})`);
    for (const i of known) {
      out.push(`  ${describe(i)}: ${[i.verdict.ticket, i.verdict.reason, basis(i), newness(i.history)].filter(Boolean).join('; ')}`);
    }
  }
  return out;
}
