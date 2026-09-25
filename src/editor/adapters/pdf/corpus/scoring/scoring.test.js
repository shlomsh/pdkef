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
    const { byKind } = scored.get(form.name);
    const fell = Object.entries(form.byKind)
      .filter(([, floor]) => floor.recall !== null)
      .filter(([kind, floor]) => (byKind[kind]?.recall ?? 0) < floor.recall - SLACK)
      .map(([kind, floor]) => `${kind}: ${byKind[kind]?.recall?.toFixed(1) ?? 'absent'}% < ${floor.recall}%`);
    expect(fell, `per-kind recall fell for ${form.name}`).toEqual([]);
  });

  it('has not gained recall on any kind beyond what is recorded, without a re-record', () => {
    const { byKind } = scored.get(form.name);
    const rose = Object.entries(form.byKind)
      .filter(([, floor]) => floor.recall !== null)
      .filter(([kind, floor]) => (byKind[kind]?.recall ?? floor.recall) > floor.recall + SLACK)
      .map(([kind, floor]) => `${kind}: ${byKind[kind]?.recall?.toFixed(1)}% > ${floor.recall}%`);
    expect(rose, `per-kind recall rose for ${form.name} - re-record the baseline`).toEqual([]);
  });

  it('is at least as precise as it used to be, on every kind of field (FORM-21)', () => {
    // Mirrors the whole-form null-precision rule, per kind: a kind recorded
    // with no candidates is pinned at exactly zero candidates, the same "the
    // zero is an assertion" rule the form-level check above uses. This is
    // what catches a kind starting to produce false positives while another
    // kind's gain holds the form's total precision up.
    const { byKind } = scored.get(form.name);
    const problems = Object.entries(form.byKind).flatMap(([kind, floor]) => {
      if (floor.precision === null) {
        const candidates = byKind[kind]?.candidates ?? 0;
        return candidates === 0 ? [] : [`${kind}: now yields candidates where it recorded none - re-record the baseline`];
      }
      const precision = byKind[kind]?.precision ?? 0;
      return precision < floor.precision - SLACK ? [`${kind}: ${precision.toFixed(1)}% < ${floor.precision}%`] : [];
    });
    expect(problems, `per-kind precision fell for ${form.name}`).toEqual([]);
  });

  it('has not gained precision on any kind beyond what is recorded, without a re-record', () => {
    const { byKind } = scored.get(form.name);
    const rose = Object.entries(form.byKind)
      // A null baseline is already pinned exactly, both directions, above.
      .filter(([, floor]) => floor.precision !== null)
      .filter(([kind, floor]) => (byKind[kind]?.precision ?? floor.precision) > floor.precision + SLACK)
      .map(([kind, floor]) => `${kind}: ${byKind[kind]?.precision?.toFixed(1)}% > ${floor.precision}%`);
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
