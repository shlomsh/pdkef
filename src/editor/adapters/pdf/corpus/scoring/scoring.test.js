import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatRow, scoreForm, SLACK } from './score.js';

/**
 * The scored corpus: how well the detector does on real forms, every run.
 *
 * The element corpus beside this one answers "does this element still behave
 * the way we decided" - a yes/no per behaviour. It cannot tell you the
 * detector got 20 points worse on a real page, because no row is about a real
 * page. This is the other half: reviewed ground truth for whole forms, scored
 * with MOBI-10's matcher, ratcheted so a gain is never quietly lost.
 *
 * **A ratchet, not a target, in both directions (FORM-21).** `baselines.json`
 * records what we get today. The floor checks below fail when a number goes
 * *down*. The ceiling checks fail when a number goes *up* by more than
 * `SLACK`, because a gain nobody wrote down is a baseline nobody can prove
 * moved: the next change can give it back and this file would stay green.
 * "Re-record" means paste `score-form.mjs`'s printed row over the old one, in
 * the change that earned the gain, with a note saying why.
 *
 * Adding a form is a row in `baselines.json` and a ground-truth file; no new
 * test code. `README.md` has the procedure.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
const baselines = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/editor/adapters/pdf/corpus/scoring/baselines.json'), 'utf8'));
const FORMS = Object.entries(baselines.forms).map(([name, spec]) => ({ name, ...spec }));

/**
 * Every kind that shows up on either side of a comparison, baseline or
 * actual (FORM-21 review). The per-kind checks below used to iterate
 * `Object.entries(form.byKind)` alone, which only ever walks the baseline's
 * own keys - a kind the actual run stopped producing (or started producing)
 * was invisible to every one of them, because a key that is not in the
 * object being iterated is never visited, floor or ceiling.
 */
const unionKinds = (baselineByKind, actualByKind) => [...new Set([...Object.keys(baselineByKind), ...Object.keys(actualByKind)])];

const scored = new Map();

beforeAll(async () => {
  for (const form of FORMS) {
    scored.set(form.name, await scoreForm({
      pdf: path.join(repoRoot, form.pdf),
      truth: path.join(repoRoot, form.truth),
      // Case-agnostic: most forms score page 0 and leave this undefined, so scoreForm's own
      // default applies. A form scored on a later page (FORM-16's ภ.ง.ด.90, page 3) says so in
      // its own baselines.json row rather than needing a special case here.
      pageIndex: form.pageIndex,
    }));
  }
  // Always visible, not only on failure: a passing run that silently improved
  // is the one you want to notice, because the baseline needs re-recording.
  for (const form of FORMS) {
    const result = scored.get(form.name);
    // eslint-disable-next-line no-console
    console.log(`${formatRow(result)}   (baseline ${form.recall}% / ${form.precision}%)`);
  }
});

describe.each(FORMS)('$name', (form) => {
  it('finds at least as many of its fields as it used to', () => {
    const { recall } = scored.get(form.name);
    expect(recall, `recall fell below the recorded baseline for ${form.name}`)
      .toBeGreaterThanOrEqual(form.recall - SLACK);
  });

  it('has not gained recall beyond what is recorded, without a re-record', () => {
    // The other half of the ratchet (FORM-21): a rise nobody wrote down is a
    // baseline nobody can prove moved, and the next change gets to give the
    // gain back with nothing here to notice. "Re-record" means paste
    // score-form.mjs's printed row over this one, in the change that earned it.
    const { recall } = scored.get(form.name);
    expect(recall, `recall rose above the recorded baseline for ${form.name} by more than SLACK - re-record the baseline`)
      .toBeLessThanOrEqual(form.recall + SLACK);
  });

  it('is at least as precise as it used to be', () => {
    const { precision, candidates } = scored.get(form.name);
    // A `null` baseline precision records that this form yields no candidates
    // at all, which today only the scanned form does: its page carries no
    // vector ink, so there is nothing to be precise about. Pin the zero
    // exactly rather than skipping the row. A change that starts finding
    // something on a scan is the best news this corpus could report, and it
    // should fail here and be re-recorded, not pass unnoticed - which is the
    // same rule as a number going up, applied to a number coming off zero.
    if (form.precision === null) {
      expect(candidates, `${form.name} now yields candidates where it recorded none - re-record the baseline`).toBe(0);
      return;
    }
    expect(precision, `precision fell below the recorded baseline for ${form.name}`)
      .toBeGreaterThanOrEqual(form.precision - SLACK);
  });

  it('has not gained precision beyond what is recorded, without a re-record', () => {
    const { precision } = scored.get(form.name);
    // A null baseline is already pinned exactly (both directions) by the
    // null-candidates check above, so there is nothing further to ratchet here.
    if (form.precision === null) return;
    expect(precision, `precision rose above the recorded baseline for ${form.name} by more than SLACK - re-record the baseline`)
      .toBeLessThanOrEqual(form.precision + SLACK);
  });

  it('holds its recall on every kind of field, not just overall', () => {
    // A whole-form number can hold while one kind collapses and another
    // improves. The per-kind floor is what catches that trade. A `null`
    // recorded recall means the kind has no targets on this form at all (it
    // only exists in byKind because the detector candidates it) - nothing to
    // hold, so it is excluded rather than compared against 0.
    //
    // Iterated over the UNION of the baseline's kinds and the actual run's
    // kinds (FORM-21 review), not the baseline's alone: a kind the baseline
    // recorded that has vanished from the actual output entirely is a
    // regression the old `Object.entries(form.byKind)` loop could never see,
    // because it never looked at a kind the baseline did not already know
    // about missing being exactly the failure mode to catch.
    const { byKind } = scored.get(form.name);
    const fell = unionKinds(form.byKind, byKind).flatMap((kind) => {
      const floor = form.byKind[kind];
      if (!floor || floor.recall === null) return [];
      if (!byKind[kind]) return [`${kind}: vanished from the detector's output - recorded ${floor.recall}% recall`];
      const recall = byKind[kind].recall ?? 0;
      return recall < floor.recall - SLACK ? [`${kind}: ${recall.toFixed(1)}% < ${floor.recall}%`] : [];
    });
    expect(fell, `per-kind recall fell for ${form.name}`).toEqual([]);
  });

  it('has not gained recall on any kind beyond what is recorded, without a re-record', () => {
    // The mirror case (FORM-21 review): a kind the actual run produced that
    // the baseline never recorded at all - not merely a rise on a known kind
    // - is exactly as unrecorded as a rise, so it fails here too.
    const { byKind } = scored.get(form.name);
    const rose = unionKinds(form.byKind, byKind).flatMap((kind) => {
      const actual = byKind[kind];
      if (!actual || actual.recall === null) return [];
      const floor = form.byKind[kind];
      if (!floor) return [`${kind}: appeared with ${actual.recall.toFixed(1)}% recall, not recorded - re-record the baseline`];
      if (floor.recall === null) return [];
      return actual.recall > floor.recall + SLACK ? [`${kind}: ${actual.recall.toFixed(1)}% > ${floor.recall}%`] : [];
    });
    expect(rose, `per-kind recall rose for ${form.name} - re-record the baseline`).toEqual([]);
  });

  it('is at least as precise as it used to be, on every kind of field (FORM-21)', () => {
    // Mirrors the whole-form null-precision rule, per kind: a kind recorded
    // with no candidates is pinned at exactly zero candidates, the same "the
    // zero is an assertion" rule the form-level check above uses. This is
    // what catches a kind starting to produce false positives while another
    // kind's gain holds the form's total precision up. Union of kinds, same
    // reason as the recall floor above: a recorded kind whose candidates
    // vanish entirely is a regression, not a silent pass.
    const { byKind } = scored.get(form.name);
    const problems = unionKinds(form.byKind, byKind).flatMap((kind) => {
      const floor = form.byKind[kind];
      if (!floor) return [];
      if (floor.precision === null) {
        const candidates = byKind[kind]?.candidates ?? 0;
        return candidates === 0 ? [] : [`${kind}: now yields candidates where it recorded none - re-record the baseline`];
      }
      if (!byKind[kind]) return [`${kind}: vanished from the detector's output - recorded ${floor.precision}% precision`];
      const precision = byKind[kind].precision ?? 0;
      return precision < floor.precision - SLACK ? [`${kind}: ${precision.toFixed(1)}% < ${floor.precision}%`] : [];
    });
    expect(problems, `per-kind precision fell for ${form.name}`).toEqual([]);
  });

  it('has not gained precision on any kind beyond what is recorded, without a re-record', () => {
    const { byKind } = scored.get(form.name);
    const rose = unionKinds(form.byKind, byKind).flatMap((kind) => {
      const actual = byKind[kind];
      if (!actual || actual.precision === null) return [];
      const floor = form.byKind[kind];
      if (!floor) return [`${kind}: appeared with ${actual.precision.toFixed(1)}% precision, not recorded - re-record the baseline`];
      // A null baseline is already pinned exactly, both directions, above.
      if (floor.precision === null) return [];
      return actual.precision > floor.precision + SLACK ? [`${kind}: ${actual.precision.toFixed(1)}% > ${floor.precision}%`] : [];
    });
    expect(rose, `per-kind precision rose for ${form.name} - re-record the baseline`).toEqual([]);
  });

  it('scores a form that really has targets in it', () => {
    // Non-vacuity: an empty or unreadable truth file would make every
    // assertion above pass by having nothing to compare. Targets are the half
    // that must always be there; candidates are a measurement, and zero of
    // them is a legitimate one, so that half is asserted by the recorded
    // precision above rather than here.
    const { targets } = scored.get(form.name);
    expect(targets).toBeGreaterThan(5);
  });

  it('matches its recorded counts exactly (FORM-21 review)', () => {
    // Percentages round to one decimal, which is why SLACK exists; the raw
    // integers behind them do not round at all, so they are pinned exactly
    // rather than within SLACK. This is what makes a same-percentage,
    // different-underlying-numbers change visible (e.g. targets and matched
    // both scaling together) rather than passing as "unchanged" by
    // coincidence. Only kinds present on both sides are checked here - a kind
    // that appeared or vanished is already reported, with a clearer message,
    // by the recall/precision tests above.
    const result = scored.get(form.name);
    expect(result.targets, `${form.name} targets count moved`).toBe(form.targets);
    expect(result.candidates, `${form.name} candidates count moved`).toBe(form.candidates);
    expect(result.matched, `${form.name} matched count moved`).toBe(form.matched);
    for (const kind of unionKinds(form.byKind, result.byKind)) {
      const floor = form.byKind[kind];
      const actual = result.byKind[kind];
      if (!floor || !actual) continue;
      expect(actual.targets, `${form.name}/${kind} targets count moved`).toBe(floor.targets);
      expect(actual.found, `${form.name}/${kind} found count moved`).toBe(floor.found);
      expect(actual.candidates, `${form.name}/${kind} candidates count moved`).toBe(floor.candidates);
      expect(actual.matchedCandidates, `${form.name}/${kind} matchedCandidates count moved`).toBe(floor.matchedCandidates);
    }
  });
});

describe('the scored corpus as a whole', () => {
  it('covers more than one form, and more than one script', () => {
    expect(FORMS.length).toBeGreaterThanOrEqual(3);
    // Two Hebrew government forms and our own Latin practice form. A detector
    // scored only on Hebrew would not notice a Latin-only regression, which
    // MOBI-11 has wanted covered for a while.
    expect(FORMS.some((form) => form.name === 'pdkef-practice-form')).toBe(true);
  });

  it('records a baseline for every form it scores, and scores every form it records', () => {
    for (const form of FORMS) {
      expect(typeof form.recall, `${form.name} has no recorded recall`).toBe('number');
      // `null` is a recorded precision: it says "no candidates". Undefined is not.
      expect(form.precision === null || typeof form.precision === 'number',
        `${form.name} has no recorded precision`).toBe(true);
      expect(fs.existsSync(path.join(repoRoot, form.pdf)), `${form.name}: ${form.pdf} is missing`).toBe(true);
      expect(fs.existsSync(path.join(repoRoot, form.truth)), `${form.name}: ${form.truth} is missing`).toBe(true);
      for (const [kind, row] of Object.entries(form.byKind)) {
        expect(row.recall === null || typeof row.recall === 'number',
          `${form.name}/${kind} has no recorded recall`).toBe(true);
        expect(row.precision === null || typeof row.precision === 'number',
          `${form.name}/${kind} has no recorded precision`).toBe(true);
      }
    }
  });
});
