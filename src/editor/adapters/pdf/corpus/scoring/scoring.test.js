import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatRow, scoreForm } from './score.js';

/**
 * The scored corpus: how well the detector does on real forms, every run.
 *
 * The element corpus beside this one answers "does this element still behave
 * the way we decided" - a yes/no per behaviour. It cannot tell you the
 * detector got 20 points worse on a real page, because no row is about a real
 * page. This is the other half: reviewed ground truth for whole forms, scored
 * with MOBI-10's matcher, ratcheted so a gain is never quietly lost.
 *
 * **A ratchet, not a target.** `baselines.json` records what we get today.
 * These assertions fail when a number goes *down*. A number going up is free,
 * and should be re-recorded in the change that earned it - otherwise the next
 * change gets to lose it without anybody noticing, which is the exact failure
 * this exists to prevent.
 *
 * Adding a form is a row in `baselines.json` and a ground-truth file; no new
 * test code. `README.md` has the procedure.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
const baselines = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/editor/adapters/pdf/corpus/scoring/baselines.json'), 'utf8'));
const FORMS = Object.entries(baselines.forms).map(([name, spec]) => ({ name, ...spec }));

/**
 * Both sides are rounded to one decimal, so this only absorbs float noise,
 * never a real regression: a tenth of a point on the smallest scored form
 * (9 targets) is a fortieth of one field.
 */
const SLACK = 0.05;

const scored = new Map();

beforeAll(async () => {
  for (const form of FORMS) {
    scored.set(form.name, await scoreForm({
      pdf: path.join(repoRoot, form.pdf),
      truth: path.join(repoRoot, form.truth),
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

  it('is at least as precise as it used to be', () => {
    const { precision } = scored.get(form.name);
    expect(precision, `precision fell below the recorded baseline for ${form.name}`)
      .toBeGreaterThanOrEqual(form.precision - SLACK);
  });

  it('holds its recall on every kind of field, not just overall', () => {
    // A whole-form number can hold while one kind collapses and another
    // improves. The per-kind floor is what catches that trade.
    const { byKind } = scored.get(form.name);
    const fell = Object.entries(form.byKind)
      .filter(([kind, floor]) => (byKind[kind]?.recall ?? 0) < floor - SLACK)
      .map(([kind, floor]) => `${kind}: ${byKind[kind]?.recall?.toFixed(1) ?? 'absent'}% < ${floor}%`);
    expect(fell, `per-kind recall fell for ${form.name}`).toEqual([]);
  });

  it('scores a form that really has targets in it', () => {
    // Non-vacuity: an empty or unreadable truth file would make every
    // assertion above pass by having nothing to compare.
    const { targets, candidates } = scored.get(form.name);
    expect(targets).toBeGreaterThan(5);
    expect(candidates).toBeGreaterThan(0);
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
      expect(typeof form.precision, `${form.name} has no recorded precision`).toBe('number');
      expect(fs.existsSync(path.join(repoRoot, form.pdf)), `${form.name}: ${form.pdf} is missing`).toBe(true);
      expect(fs.existsSync(path.join(repoRoot, form.truth)), `${form.name}: ${form.truth} is missing`).toBe(true);
    }
  });
});
